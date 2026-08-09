# Pupu 通用 Agent 首页与任务呈现系统

## 目标

把当前以“今晚吃什么”为固定内容的动效演示，改造成手机端优先的通用 Agent 首页。首页只负责接收自然语言指令；吃饭、采购、快递、外卖和未来能力都由同一模板按任务重量生成对应组件。

当前实现仍以纯前端演示为主，不创建订单、不扣款，也不把演示商品伪装成真实朴朴数据。后续接入时，所有业务能力都必须经过核心 Agent 编排，前端不直接调用 Pupu CLI 或其他服务。

## 通用 Agent 架构

所有能力共用同一条信息流：

```text
用户自然语言
  -> 核心 Agent（意图识别、任务编排、风险判断）
  -> 能力提供方（Pupu CLI / 快递 / 外卖 / 天气 / 未来工具）
  -> 统一生成式 UI 事件
  -> 前端选择 anchored / canvas / sheet 并渲染对应卡片
```

核心 Agent 是唯一的调度入口。它负责理解“查朴朴订单”“两个人吃火锅，预算 120 元”“查快递”等不同意图，决定调用哪个能力，并给出展示模式。能力提供方只返回可信业务事实，不决定页面布局。前端只消费统一事件，不包含 Pupu、快递或外卖的业务编排逻辑。

新增能力时，只需增加一个能力提供方和对应卡片 schema，不重写输入框、Agent 会话或任务状态机。

## 统一生成式 UI 契约

核心 Agent 向前端输出稳定信封，业务数据放在 `payload` 中：

```ts
interface AgentUIEvent<TPayload> {
  runId: string;
  capability: "pupu" | "parcel" | "delivery" | "weather" | string;
  intent: string;
  presentationMode: "anchored" | "canvas" | "sheet";
  component: string;
  state: JourneyState;
  dataSource: "live" | "demo";
  payload: TPayload;
  occurredAt: string;
}
```

- `capability` 标识工具提供方，允许未来扩展。
- `component` 选择允许渲染的卡片，不接受任意 HTML 或脚本。
- `dataSource` 必须显示在业务卡片上，真实数据与示例数据不能混淆。
- 商品、价格、库存、订单和物流事实只能来自对应提供方；模型可生成推荐理由，但不能虚构业务事实。
- 失败以同一个 `runId` 返回 `error` 事件，原容器内显示重试，不偷偷换成演示数据。

## Pupu 采购链路

用户选择的交互为“先看方案，再加入购物车”：

1. 用户向核心 Agent 描述人数、菜品、预算、忌口或具体商品。
2. 核心 Agent 拆解需求并调用 Pupu CLI 的只读搜索能力。
3. CLI 返回商品摘要；适配层标准化名称、规格、价格、库存、商品 ID、图片 URL 和采集时间。
4. 前端在 `canvas` 中展示采购方案、推荐理由、替代商品、合计金额和预计送达信息。
5. 用户点击“加入购物车”后，只写入有版本号的助手购物车，卡片原位转换为 `cart_updated`。
6. 用户可调整数量、移除或替换商品；任何修改都会产生新的助手购物车版本。
7. 同步真实朴朴购物车前，升级为 `sheet + awaiting_input` 并要求明确确认。
8. 结算或提交订单继续使用长按授权；付款不由网页自动完成。

建议的采购阶段为：

```text
planning -> cart_ready -> adding_to_cart -> cart_updated
         -> awaiting_input -> ready | error
```

`cart_ready` 和 `cart_updated` 是业务阶段，可放在事件 `payload.stage` 中；页面级 `JourneyState` 继续负责 receiving、reasoning、assembling、ready、error、awaiting_input 和 interrupted。

### 商品卡数据

每个商品至少包含：

```ts
interface ProductSummary {
  productId: string;
  name: string;
  specification: string;
  unitPrice: number;
  quantity: number;
  currency: "CNY";
  stockStatus: "in_stock" | "low_stock" | "out_of_stock" | "unknown";
  imageUrl?: string;
  collectedAt: string;
}
```

图片优先使用 CLI 返回的可信 URL，并通过服务端图片代理或允许列表处理。无图、超时或加载失败时使用克制的品类占位，不影响文字摘要。前端不得通过商品名称猜测或拼接朴朴图片地址。

## 设计判断

- 页面类型：面向手机端的通用 Agent 产品首页。
- 视觉语言：安静、克制的暖中性色，重点靠层级和物理动效表达，不使用霓虹。
- 设计参数：`DESIGN_VARIANCE = 6`、`MOTION_INTENSITY = 7`、`VISUAL_DENSITY = 4`。
- 标题保持轻字重。首页主标题使用 500 左右字重，避免再出现“把需求变成今晚的安排”这种过粗、过窄的固定业务标题。
- 圆角规则：输入框 18-20px、内容卡 20-24px、底部面板 28px、图标按钮 12-14px。按钮可为圆形，但内容容器不使用随意混合的圆角。

## 三层呈现契约

任务呈现方式是业务契约，不是组件自行选择的视觉偏好。

| 呈现模式 | 适用任务 | 页面行为 | 示例 |
| --- | --- | --- | --- |
| `anchored` | 轻量、单结果、可快速扫读 | 输入框保留，结果卡紧贴输入框下方弹出；最近记录收起 | 查快递、查外卖、天气、简单问答 |
| `canvas` | 复杂、多步骤、需要 Trace 或完整方案 | 首页引导内容退场，任务接管中央画布；输入框移动到底部继续追问 | 今晚吃什么、Pupu 采购方案、多步骤 Agent 执行 |
| `sheet` | 临时详情、需要返回首页、高风险确认 | 首页留在背景，底部面板升起；可关闭或完成授权 | 地址选择、付款、退款、扣款、订单确认 |

默认规则：轻任务就地回答，重任务展开舞台，高风险操作浮层确认。

未来接入 Vercel AI SDK 后，核心 Agent 的结构化事件应直接提供 `presentationMode` 和 `component`。本地关键词识别只用于当前纯前端演示，不作为未来生产意图识别器。

## 生命周期契约

`presentationMode` 与 `JourneyState` 相互独立：前者决定结果放在哪里，后者决定任务进行到哪一步。

| SDK 生命周期或事件 | `JourneyState` | 动效 |
| --- | --- | --- |
| 请求刚发送 | `receiving` | 输入确认，轻微呼吸反馈 |
| Stream Thought 或 `onToolCall` | `reasoning` | 展开安全的 Trace 摘要 |
| 工具返回，开始组装 UI | `assembling` | 约束和结果组件形变汇合 |
| `onFinish` | `ready` | 沉稳弹簧落定，主动作出现 |
| `onError` | `error` | 当前容器内优雅降级，提供重试 |
| 高风险工具请求确认 | `awaiting_input` | 进入底部面板，长按确认或拒绝 |
| 用户输入新指令 | `interrupted` | 旧任务快速收尾，新任务从输入框继续 |

## 固定动效参数

全项目只使用两个主要弹簧，避免不同组件随意填数：

```ts
export const JOURNEY_SPRINGS = {
  quickSnappy: { type: "spring", stiffness: 400, damping: 25 },
  groundedSettle: {
    type: "spring",
    stiffness: 180,
    damping: 24,
    mass: 1.2,
  },
} as const;
```

- `quickSnappy`：输入确认、卡片弹出、Trace 展开、标签变化、打断退场。
- `groundedSettle`：完整方案落定、底部面板停稳、最终动作出现。
- 所有动效只改变 `transform` 和 `opacity`，并遵守 `prefers-reduced-motion`。

## 首页结构

初始首页只保留四部分：

1. 品牌栏：`Pupu` 和轻量账户入口。
2. 轻字重标题：`今天想让我做什么？`
3. 通用输入框：可输入任何生活指令，所有消息先发给核心 Agent。
4. 两条最近任务或三个低干扰示例入口，用于演示三种模式；Pupu 主入口使用“朴朴帮我买”。

手机端是基准布局，使用 `min-height: 100dvh`。桌面端只扩大留白和内容最大宽度，不改变交互结构。

## 状态与容器组合

- `anchored + error`：错误提示替换结果卡，不跳出上下文。
- `canvas + error`：中央画布内显示错误卡和重试。
- 任意高风险操作都升级到 `sheet + awaiting_input`，不能留在普通结果卡里静默确认。
- `interrupted` 先让当前容器退出，再根据新任务的 `presentationMode` 进入新容器。
- Sheet 必须有遮罩点击关闭、明确关闭按钮、焦点语义和移动端安全区间距。

## 验收标准

- 390x844 和 320x720 下无横向滚动、卡片穿模或按钮遮挡。
- 初始页面不再自动播放火锅流程，标题不是固定晚餐文案。
- 点击或提交“查一下我的快递”后，结果卡出现在输入框正下方。
- 提交“今晚吃什么”后，中央画布承载既有 LiquidJourney 流程。
- 提交“两个人今晚吃火锅，预算 120 元”后，先生成带来源标识、商品摘要和可选图片的 Pupu 采购方案。
- 点击“加入购物车”只更新助手购物车并展示新版本，不静默写入真实朴朴购物车。
- 真实 CLI 无图片时正常展示文字摘要；CLI 失败时显示错误与重试，不回退成假商品。
- 同步真实朴朴购物车或去结算前，必须进入底部授权面板。
- 提交“确认退款”后，底部授权面板在首页上方升起。
- 三种容器都能返回首页或被新指令打断。
- `error`、`awaiting_input`、`interrupted` 仍可恢复。
- 单元测试、类型检查、构建和 Playwright 手机端测试全部通过。

## 本轮实施边界

- 实现核心 Agent 事件的前端类型、Pupu 商品方案卡、图片降级、助手购物车转换动画和授权入口。
- 用明确标注的示例事件验证界面；未连接外部 CLI 时不声称真实商品已接入。
- 为未来 CLI 接入保留 provider adapter，不在本前端仓库中复制 CLI、鉴权或签名实现。
- 快递、外卖、天气和未来能力沿用同一事件信封与呈现系统。
