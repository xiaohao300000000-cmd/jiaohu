# 统一任务状态与能力路由中心设计

## 目标

建立服务器端唯一的任务判断与能力授权中心。用户输入只解析一次；前端、Hermes 和交易接口读取同一个带版本任务快照，不再分别用正则或组件本地状态判断业务意图。

本次不新增第二个对话框。产品继续使用一个输入框和一个 Journey；服务器任务阶段决定 Journey 显示普通回答、登录、地址、真实商品、方案修改、购物车确认、订单确认或付款链接。

## 当前问题

- `src/components/home/presentation.ts` 的 `isPupuTask()` 决定前端是否先登录和选址。
- `src/ai/useLiveJourney.ts` 把前端判断转换为 `pupuIntent`。
- `server/chat-handler.ts` 信任 `pupuIntent`，随后 `hermesInput()` 再判断复杂餐食或购物车读取并选择工具提示。
- `server/pupu/request-classifier.ts` 仅被测试引用，是遗留的第二套分类器。
- 购物车与结算阶段保存在 `PupuCartConfirmCard`、`PupuCheckoutJourney` 的组件本地 state；服务器只验证各自 preview，没有统一任务阶段。
- 人数、预算、饮食要求、商品数量和已选商品没有集中在一个可版本化任务事实中。

## 架构

```text
用户输入 + 当前 taskId
        ↓
TaskCoordinator（唯一解析、上下文合并、阶段迁移）
        ↓
TaskSnapshot + version
   ↙           ↓             ↘
Journey UI   Hermes contract   CapabilityPolicy
                               ↓
                     Pupu / future providers
```

`TaskCoordinator` 只负责业务事实和合法状态迁移。展示仍由 Journey reducer 负责；Pupu CLI 仍是外部 Provider；已有 cart/checkout Controller 继续负责 provider preview、幂等、回读和官方付款链接验证。

## 任务快照

```ts
interface TaskSnapshot {
  taskId: string;
  version: number;
  requestText: string;
  domain: "general" | "commerce" | "delivery" | "home_automation" | "calendar";
  goal: "advice" | "find_products" | "revise_plan" | "prepare_cart" | "create_order";
  phase:
    | "advising"
    | "awaiting_login"
    | "awaiting_address"
    | "searching_catalog"
    | "editing_plan"
    | "awaiting_cart_confirmation"
    | "writing_cart"
    | "awaiting_order_confirmation"
    | "creating_order"
    | "awaiting_payment"
    | "completed"
    | "blocked";
  context: {
    peopleCount?: number;
    budgetCents?: number;
    dietaryRequirements: string[];
    requirements: string[];
    selectedProducts: TaskProduct[];
    addressBinding?: TaskAddressBinding;
    cartPreview?: TaskConfirmation;
    checkoutPreview?: TaskConfirmation;
  };
  allowedCapabilities: TaskCapability[];
  nextActions: TaskAction[];
}
```

任务 ID 由服务器生成。后续输入携带 `taskId`；服务器合并新信息并递增 version。`resume: true` 只恢复已保存任务，不重新解析用户文本。

## 单次判断与上下文规则

- 新输入只由 `TaskCoordinator.resolve()` 分类一次。
- `pupuIntent`、前端 `isPupuTask()` 和 `hermesInput()` 内的业务正则全部退出生产路由。
- 当前 commerce 任务中的“改成两瓶”“预算改成 120”继续原任务；明确的新领域请求建立新任务。
- 未提及的既有人数、预算和饮食要求继续保留；明确修改才覆盖。
- 商品、数量或地址改变时废止旧 cart/checkout confirmation。
- Provider 返回的真实商品由服务器写入 `selectedProducts`，前端不能自行注入真实商品事实。

## 登录和地址恢复

首次请求若需要 commerce 能力，服务器先解析任务，再验证 Pupu 浏览器会话和地址：

- 未登录：保存任务为 `awaiting_login` 并返回同一 Journey 的登录 presentation。
- 已登录但未选地址：保存为 `awaiting_address` 并返回地址 presentation。
- 登录和地址完成后，前端以 `taskId + resume: true` 恢复；服务器验证真实状态后进入 `searching_catalog`，不重新分类。

## Hermes 边界

Hermes 获得由 TaskSnapshot 生成的结构化执行契约，而不是原始正则推断：

- `commerce.catalog.search` → 只允许一次 `pupu_search_catalog`。
- `commerce.catalog.meal-search` → 只允许一次 `pupu_search_meal_catalog`。
- `commerce.cart.read` → 只允许一次 `pupu_read_cart`。
- general advice 不签发 Pupu scope。

scope ticket 继续保护账号目录，并增加 taskId、taskVersion 和 allowedCapabilities。插件仍 fail closed；提示词不是权限边界。

## 交易权限

- `awaiting_cart_confirmation` 只允许生成 cart preview。
- cart commit 必须匹配 taskId、taskVersion、previewId、地址和幂等键；成功后进入 `awaiting_order_confirmation`。
- checkout preview 只允许在 `awaiting_order_confirmation` 读取。
- 创建订单必须匹配 checkout preview、版本、地址、有效期和明确 UI action；执行时进入 `creating_order`，成功后进入 `awaiting_payment`。
- 自然语言“确认”不能直接进入 `writing_cart` 或 `creating_order`。
- 失败或结果未知不得自动重复写入。

## 未来能力

任务中心输出通用 capability，不输出 `isPupuTask` 一类 provider 布尔值：

```text
commerce.catalog.search
commerce.catalog.meal-search
commerce.cart.prepare
commerce.cart.write
commerce.checkout.preview
commerce.order.create
commerce.payment.read
delivery.quote
delivery.order.create
home.device.read
home.device.control
calendar.event.read
calendar.event.create
```

顺丰、Home Assistant、日历或其他零售平台通过 Provider adapter 接入，不修改前端意图判断。

## 错误和恢复

- taskId 不存在、版本冲突或非法迁移返回结构化 409，不静默新建任务。
- 登录、地址或 provider 失败保持任务和上下文，Journey 显示可恢复错误。
- 高风险阶段发生未知结果时进入 `blocked`，要求回读，不允许盲目重试。
- 服务器重启后的持久化不在本次最小实现中；TaskStore 保留持久化接口，首版使用进程内实现，与当前 cart/checkout Controller 生命周期一致。

## 验收

- “帮我看看大瓶牛奶”只解析一次并进入登录/地址/真实搜索。
- 普通建议不触发 Pupu 登录或 scope ticket。
- 连续输入保留人数、预算、饮食要求和已选商品。
- 前端请求不再包含 `pupuIntent`。
- Hermes 不再使用业务正则选择 Pupu 工具。
- 未到确认阶段的 cart/checkout 写请求被服务器拒绝，且 Provider 不启动。
- 合法 preview + 明确 UI action 才能写购物车或创建订单。
- 已有真实 CLI、preview、幂等、回读和 invite-pay 安全校验继续通过。
