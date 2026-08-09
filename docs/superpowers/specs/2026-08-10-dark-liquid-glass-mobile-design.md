# 深色 Liquid Glass 手机端视觉重构

## 设计结论

本轮把用户确认的深色参考图设为唯一视觉基准。当前暖白背景、白色卡片和常规购物 App 观感不再继续迭代。

这是一次保留产品结构的视觉重构：Agent 状态机、来源锚定、Pupu 决策层级、商品证据层、悬浮 composer、错误和授权状态全部保留；主题、材质、空间背景、任务 surface 与排版密度重新实现。

页面类型是手机端优先的 Agent 生活助理。视觉语言是克制的中性深色烟熏玻璃，不使用霓虹、彩色光斑或装饰性渐变。

## 手机端构图基准

390 x 844 是主要构图基准，320 x 720 是收缩验证尺寸。

页面从上到下分为极轻状态栏、无边界 Canvas、从输入框形变而来的任务对象，以及固定在底部安全区上方的玻璃 composer。

参考图中的大块玻璃是任务对象本身，不是 Canvas 外再套一层页面母卡。它必须从原输入框连续形变而来，并且只包裹当前任务内容。

## 深色空间背景

页面采用固定深色主题：

```css
--scene-bg: #131414;
--scene-foreground: #f2f2ef;
--scene-muted: rgba(242, 242, 239, 0.56);
--scene-hairline: rgba(255, 255, 255, 0.09);
```

玻璃后方必须存在可感知但不抢内容的中性灰明暗场。它只使用黑、白、灰，不引入彩色污染。环境层允许缓慢平移或缩放，但只能改变 `transform` 和 `opacity`。

背景的作用是给玻璃提供可透射、可模糊、可遮挡的视觉证据。即使动画暂停，截图里也必须看得到玻璃前后层的差异。

## 任务对象玻璃材质

建议起始 token：

```css
--glass-fill: rgba(31, 32, 32, 0.62);
--glass-edge: rgba(255, 255, 255, 0.12);
--glass-inner-highlight: rgba(255, 255, 255, 0.08);
--glass-inner-shade: rgba(0, 0, 0, 0.18);
--glass-shadow: rgba(0, 0, 0, 0.42);
--glass-blur: 28px;
```

材质至少包含半透明深色填充、固定 backdrop blur、迎光侧内边缘高光、底部内阴影和外部深度阴影。允许使用伪元素构建局部反光和双层边缘，但不能用一圈等亮白边框代替材质。

任务对象圆角在手机端约 24 到 28px。外壳内部以留白和细分隔线组织信息，不把每个区块再次包成卡片。

## 来源连续性

现有 shared-layout 标识继续生效：

```text
journey-origin
journey-request-text
journey-status
constraint-{constraintId}
product-{productId}
journey-total
journey-primary-action
```

原始输入保留在任务对象顶部。输入框外壳形变为任务对象，来源区、决策区、证据区与动作区属于同一 surface。状态切换以 surface 生长、内容附着和布局迁移为主。

## 信息层级

首屏固定先表达 Agent 决策：

```text
来自你的输入
两个人今晚火锅，120以内

AGENT DECISION
火锅 · 2 人
番茄锅底，荤素比例 4:6

预算                         送达
¥74.60 / ¥120                约 30 min

已满足  不辣  不要香菜  2人份
决策摘要
商品证据
加入助手购物车
```

预算与送达同层对齐；约束使用中性轻量标签；决策摘要只占一到两行；商品仍是可展开证据层。展开后使用编号、名称、规格、库存和价格的紧凑列表，不使用缩小版电商商品卡。主要动作只出现一次。

## 悬浮 Composer

composer 与任务对象属于同一材质家族，但层级更靠前、体积更薄。内容必须真实经过 composer 后方，并在透射区域产生可见的轮廓和亮度变化。

composer 使用独立静态 blur preset，顶部边缘高光比底部更清楚。主滚动区预留 composer 高度、安全区和额外呼吸空间，任何按钮不得被遮挡。

## Motion 契约

全局只使用 `quickSnappy` 与 `groundedSettle` 两套弹簧。Motion 只能动画 `transform` 和 `opacity`。

`filter`、`backdrop-filter`、blur token、颜色和阴影不得进入 keyframes 或 transition。材质变化通过固定材质层的 opacity 交叉与边缘高光层的 transform 完成。reduced-motion 下取消大位移、错峰和环境漂移。

## 可访问性与性能

- 没有 backdrop-filter 支持时仍满足文本和操作对比度。
- 提供 `@supports not (backdrop-filter: blur(1px))` 实色降级。
- 提供 `prefers-reduced-transparency` 高不透明度降级。
- Sheet 的 focus trap、自动聚焦、Escape 关闭和焦点恢复保持不变。
- 主要按钮触摸区域至少 44 x 44px。
- 不引入 WebGL、Canvas shader、逐帧 SVG displacement 或动态 blur。

## 保持不变

- 核心 Agent 事件信封与完整状态映射。
- Pupu CLI 的外部 provider 边界。
- 示例数据不能伪装成真实商品。
- 助手购物车与真实朴朴购物车的风险边界。
- anchored、canvas、sheet 三种呈现模式。

## 视觉验收标准

- 390 x 844 截图的主题、构图、密度和玻璃层级与确认参考图一致。
- 页面不存在暖白底、白色高不透明任务卡或彩色环境光。
- 静态截图也能看出任务对象和 composer 的透射、边缘高光、内部深度与前后遮挡。
- Canvas 无边框、圆角、填充和阴影。
- 大玻璃 surface 是输入框生长出的任务对象，不是页面里的页面。
- 来源句、决策、预算、送达、约束、证据和动作在同一个连续 surface 内。
- 商品证据折叠态与展开态都保持 Agent-first 层级。
- 320 x 720 与 390 x 844 无横向溢出、按钮遮挡或底部穿模。
- 动画运行路径不包含 filter 或 backdrop-filter 插值。
- error、awaiting_input、interrupted 和 reduced-motion 状态保持可操作。

## 验证边界

自动化覆盖关键手机截图、玻璃 computed style、fallback、composer 遮挡与安全区几何关系、reduced-motion、错误、授权和证据展开状态，并运行单元测试、lint、构建与 Playwright。

