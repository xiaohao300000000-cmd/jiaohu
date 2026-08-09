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

## Agent-first 采购结果层级

Pupu 采购方案首先表达 Agent 的决策结果，不能以商品列表作为首屏主体。

任务对象进入 ready 后，首屏结构固定为：

```text
来自你的输入
两个人今晚火锅，120 以内

火锅 · 2 人
¥108 / ¥120
预计 30 min
已满足：不辣 / 不要香菜

Agent 决策摘要
“优先保留肉类和蔬菜完整度，底料选择番茄口味。”

查看商品证据（6 件）
加入助手购物车
```

- 人数、预算使用情况、预计送达和硬约束是主要信息。
- Agent 决策摘要只解释可验证的选择依据，不显示隐藏推理或伪造置信度。
- 商品是可展开的证据层，默认只显示代表性商品和“查看全部”入口。
- 展开后才显示图片、名称、规格、单价、库存和替代品。
- 总价同时出现在预算关系中，不在底部重复制造传统电商结算栏。
- 主动作是“加入助手购物车”，不能写成已经同步真实朴朴购物车。

## 玻璃材质连续性

任务对象使用一个共享 `GlassMaterial`。CSS 变量只选择静态材质预设：

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

Motion 只动画 `transform` 和 `opacity`。`backdrop-filter`、SVG displacement 和不同 blur 强度必须是静态层级属性，不得在 Motion keyframes、Presence transition 或 CSS transition 中插值。

材质连续感通过以下方式完成：

- 固定 blur 的薄玻璃层与厚玻璃层进行 opacity 交叉。
- 边缘高光伪元素只改变 transform 和 opacity。
- 静态 SVG displacement 层只在形变瞬间通过 opacity 短暂显现。
- 不同 Z 层使用固定 blur preset，不在运动过程中计算 blur 数值。

这样保留玻璃的连续变化感，同时避免移动端每帧重新计算 blur。现有 `LiquidJourney`、`JourneyTrace` 和 `JourneyResultStack` 中所有动画 `filter: blur(...)` 必须删除。

## 悬浮 Composer

- `floating-composer` 在进入任务态后固定在 `env(safe-area-inset-bottom)` 上方。
- 它拥有独立玻璃材质和比任务内容更高的 Z 层。
- 主滚动区增加等于 composer 高度加安全区的底部 padding，保证最终操作可完全滚到 composer 上方。
- 任务内容滚到 composer 后方时，通过透明度、blur 和边缘高光体现真实遮挡与透射关系。
- composer 不放进任务 surface，不随结果卡一起滚动。
- 键盘弹出时以 `visualViewport` 或 CSS 动态视口更新底部位置，避免输入层被软键盘覆盖。

## Sheet 焦点与键盘契约

- 打开时保存 `document.activeElement`，并把焦点自动移到 sheet 内的首个主要操作；加载态则聚焦关闭按钮。
- `Tab` 与 `Shift+Tab` 必须在 sheet 内循环，不得进入被遮罩的任务内容。
- `Escape` 关闭 sheet。
- 关闭后把焦点恢复到触发 sheet 的按钮。
- sheet 打开时背景内容使用 `inert` 或等价机制阻止键盘与辅助技术访问，并锁定背景滚动。
- 长按按钮仍提供 Enter 键的明确等价操作。

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
- Pupu ready 首屏先展示 `火锅 · 2 人`、`¥108 / ¥120`、预计送达与已满足约束；商品列表默认作为证据层折叠。
- Motion 运行路径不包含动画 `filter`、`backdrop-filter` 或 blur CSS 变量。
- Sheet 自动聚焦、焦点循环、Escape 退出和关闭后焦点恢复全部通过键盘测试。
- 320x720 与 390x844 无横向溢出、穿模或软键盘遮挡。
- error、awaiting_input、interrupted 和 reduced-motion 路径保持可操作。
- 单元测试、类型检查、构建和 Playwright 手机端测试全部通过。

## 体验验证分层

自动化测试只证明约束，不再被描述为产品体验验收。

### 自动化门槛

- 320x720、390x844 和长页面状态的几何关系。
- 来源输入与最终结果同时可见。
- shared-layout 节点标识稳定，阶段切换不发生整页卸载。
- 长输入、商品证据展开、内容滚动和 composer 遮挡关系。
- Sheet 的完整键盘与焦点行为。
- reduced-motion 路径。
- 关键状态截图基线：首页、reasoning、决策摘要、证据展开、助手购物车、授权 sheet。
- Playwright touch 项目中的触摸滚动和点击目标。

### 必须单独记录的真机验收

- iPhone Safari 真实软键盘弹出、收起和输入法候选栏。
- Safari 地址栏展开与收起造成的动态视口变化。
- 真实惯性滚动和底部 composer 后方的材质关系。
- PWA standalone 模式的 safe area、状态栏和返回路径。
- 低端或发热状态下的持续帧率与触摸响应。

没有完成真机项目时，只能报告“自动化门槛通过”，不能报告“手机体验合格”。

## 本轮边界

- 先把共享形变完整应用到 Pupu 采购链路，并让通用 Liquid Journey 使用相同基础组件。
- 快递等 anchored 轻任务保留原位卡片模式，不强制进入完整任务 surface。
- 不在本轮接入真实 Agent、Pupu CLI、真实购物车写入或付款。
