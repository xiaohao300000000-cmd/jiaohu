# 来源锚定的 Liquid Journey 共享形变设计

## 目标

把当前“首页退出、Canvas 出现、阶段组件轮流淡入”的任务体验，改造成一个对象从用户输入持续生长为最终结果的空间过程。

用户必须始终看得见结果的来源关系：原始输入不是被替换的页面内容，而是任务对象的种子。它依次扩展为 reasoning surface、约束和商品卡片、采购方案与助手购物车。

本设计同时删除 Canvas 内部巨大的奶白色圆角母卡，并将后续追问 composer 改成悬浮在底部的独立玻璃层。

## 核心空间叙事

```text
首页输入框
  -> 输入文字脱离编辑状态，成为 task origin
  -> 输入框外壳向下扩张为 reasoning surface
  -> 约束节点附着在同一 surface 内
  -> 商品与工具结果从 reasoning 节点长出
  -> surface 收束为采购方案
  -> 方案继续形变为助手购物车
```

这是一条对象连续性契约，不是换页动画。每个阶段都必须保留原始输入句，并通过共享 `layoutId`、持续存在的 DOM 边界或明确的共享子节点维持来源关系。

## 页面层级

页面分为三个 Z 层：

1. `task-space`：透明 Canvas，只负责滚动空间、环境光和任务对象布局，不绘制奶白色母卡。
2. `task-object`：由输入框生长出的任务对象，承载来源句、reasoning、约束、商品和最终结果。
3. `floating-composer`：固定在移动端安全区上方的玻璃输入层；任务内容可以从其后方滚动经过。

Canvas 不使用圆角、边框、填充背景或卡片阴影。页面背景就是 Canvas。局部卡片只在表达独立业务对象时出现。

## 输入到任务对象

### 初始状态

- 首页输入框使用 `layoutId="journey-origin"`。
- 输入文本使用 `layoutId="journey-request-text"`。
- 发送按钮在提交后收缩为任务状态指示，不瞬间消失。

### 提交状态

- 首页介绍和示例入口退到远景，但不驱动整页切换。
- 输入框保持屏幕内的连续位置，圆角从输入态逐渐减小，宽度和高度向任务 surface 目标值变化。
- 输入文字从表单值变成只读的来源句，位置上浮到任务对象顶部。
- 来源句旁显示轻量的 `来自你的输入`，不使用醒目的徽章。

### Reasoning 状态

- `journey-origin` 外壳向下撑开，而不是卸载输入框后挂载新组件。
- reasoning 内容从来源句下方逐层展开。
- 人数、预算、忌口和时限使用共享节点 `constraint-{id}`，从解析文字附近移动到最终约束位置。
- Trace 只展示安全摘要，不展示内部隐藏推理。

### 商品和结果状态

- 工具返回的商品使用 `product-{productId}`，从 reasoning 的查询结果位置移动到商品列表。
- 最终方案继续使用 `journey-origin` 外壳；标题、总价和操作区附着到已有表面，不创建新的整卡替代它。
- 点击加入购物车后继续复用同一个 surface 和商品节点，只改变密度、层级与动作区。

## Shared Layout 契约

稳定标识如下：

```text
journey-origin
journey-request-text
journey-status
constraint-{constraintId}
product-{productId}
journey-total
journey-primary-action
```

- 同一语义对象跨阶段必须复用相同 `layoutId`。
- 阶段切换不得使用包住整个任务区域的 `mode="wait"`；它会造成旧对象完全退出后新对象才进入。
- 新增内容允许 opacity 辅助，但位移、尺寸和层级变化必须以 layout morph 为主。
- 删除内容先收束到其来源节点，再降低透明度，不能原地凭空消失。
- `interrupted` 状态让当前任务对象缩回来源句，再由新输入接管 `journey-origin`。

## 玻璃材质连续性

任务对象使用一个共享 `GlassMaterial`，由 Motion 驱动 CSS 变量：

```text
--glass-alpha
--glass-blur
--glass-saturation
--glass-edge
--glass-refraction
--glass-depth
--glass-tint
```

材质阶段：

| 阶段 | 视觉特性 |
| --- | --- |
| 输入 | 薄、清晰、轻边缘高光、低 blur |
| reasoning | 面积变大、透射增强、局部折射短暂出现 |
| assembling | 层级最丰富，约束和商品造成轻微色彩污染 |
| ready | 折射收敛、blur 稳定、边缘和阴影更沉稳 |
| awaiting_input | 背景任务对象进一步失焦，授权层成为最清晰材质 |

Motion 负责变量插值和共享布局。CSS 负责 `backdrop-filter`、mask 高光和色彩污染。SVG displacement 只在短暂的扩张与融合阶段启用，不在静止状态持续运行。

## 悬浮 Composer

- `floating-composer` 在进入任务态后固定在 `env(safe-area-inset-bottom)` 上方。
- 它拥有独立玻璃材质和比任务内容更高的 Z 层。
- 主滚动区增加等于 composer 高度加安全区的底部 padding，保证最终操作可完全滚到 composer 上方。
- 任务内容滚到 composer 后方时，通过透明度、blur 和边缘高光体现真实遮挡与透射关系。
- composer 不放进任务 surface，不随结果卡一起滚动。
- 键盘弹出时以 `visualViewport` 或 CSS 动态视口更新底部位置，避免输入层被软键盘覆盖。

## 组件边界

- `JourneyOriginSurface`：共享的任务对象外壳与来源句。
- `JourneyStageContent`：根据状态追加 reasoning、约束、商品和结果内容，不替换外壳。
- `GlassMaterial`：集中管理玻璃 CSS 变量、背景透射、边缘高光和降级策略。
- `FloatingComposer`：任务态的独立底部输入层。
- `LiquidJourney`：只负责组合上述组件和映射状态，不再绘制母卡。

业务卡片如 Pupu 商品仍保持独立组件，但其外层 surface、来源句和阶段转换由 Liquid Journey 统一管理。

## 动效节奏

- 来源句脱离输入框：`quickSnappy`。
- surface 扩张和约束附着：`quickSnappy`，允许 30–60ms 轻微错峰。
- 商品进入和方案收束：`groundedSettle`。
- 助手购物车落定：`groundedSettle`。
- 不增加第三套全局弹簧。
- `prefers-reduced-motion` 下保留空间连续性，但取消折射、错峰和大距离移动。

## 错误与打断

- Provider 错误在现有 `journey-origin` 内展开错误区域，来源句保留。
- 重试从错误区域重新长出 reasoning，不卸载任务对象。
- 用户输入新任务时，旧对象先收束到来源句并淡出，新输入随后获得 `journey-origin`。
- 高风险确认继续使用独立 sheet，但背景必须保留当前任务对象和来源句。

## 验收标准

- 提交“两个人今晚火锅，120以内”时，输入框与任务 surface 在浏览器中拥有连续的共享布局形变。
- 任何阶段都能看到原始输入句。
- 首页与 Canvas 之间没有整页 `mode="wait"` 换页退场。
- Canvas 不存在 36px 奶白色圆角母卡、母卡边框或母卡阴影。
- 任务态 composer 悬浮在底部安全区上方，内容可从其后方滚动。
- 最终结果和主操作能够滚到 composer 上方，不发生遮挡。
- reasoning、约束、商品与结果节点使用稳定的 `layoutId`。
- 320x720 与 390x844 无横向溢出、穿模或软键盘遮挡。
- error、awaiting_input、interrupted 和 reduced-motion 路径保持可操作。
- 单元测试、类型检查、构建和 Playwright 手机端测试全部通过。

## 本轮边界

- 先把共享形变完整应用到 Pupu 采购链路，并让通用 Liquid Journey 使用相同基础组件。
- 快递等 anchored 轻任务保留原位卡片模式，不强制进入完整任务 surface。
- 不在本轮接入真实 Agent、Pupu CLI、真实购物车写入或付款。
