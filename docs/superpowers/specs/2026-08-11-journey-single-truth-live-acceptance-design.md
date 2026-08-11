# Journey 单一状态源与真实验收修正设计

日期：2026-08-11
仓库：`xiaohao300000000-cmd/jiaohu`

## 目标

保持现有主链路不变：

```text
用户输入
→ Vercel AI SDK
→ /api/chat
→ Hermes
→ SSE
→ Event Adapter
→ journeyReducer
→ Journey UI
```

本次只修正状态建模、数据协议、artifact 配对与验收标准，不新增业务能力、不重做视觉、不引入模拟业务结果。

## 当前问题

### 双重业务状态

`useLiveJourney` 同时维护 `JourneySnapshot` 与独立的 `pupuEvent`。服务端也分别发送 `data-journey` 和 `data-pupu`。因此 Pupu presentation 绕过 reducer，`App` 必须识别 Pupu，Snapshot 不是 UI 的唯一业务真相。

### transport 状态与业务状态交叉

`chat.status` 合理用于发送、停止和网络控制，但不应决定业务生命周期或结果组件。业务 UI 必须只依据 `snapshot.state` 与 `snapshot.presentation`。

### 错误被 E2E 当成成功

当前 live browser 断言把 error、ready 或 Pupu card 任意一个出现都视为成功。provider error 因而可以让“成功路径”变绿，无法证明用户拿到了真实结果。

### budget 语义错误

Pupu adapter 将 `budget = total`。当用户没有明确预算时，UI 仍显示合计/预算和进度条，造成虚假预算语义，并存在零除与非有限百分比风险。

### artifact 隐式配对

任意 `tool.completed` 都读取并删除 `sessionId.json`。连续或并行工具调用时无法验证文件是否属于当前 run、tool call 或调用序列。

### 首页承诺超出后端能力

首页文案和示例包含快递、外卖与退款等当前 Hermes readonly backend 未实现的能力，违反 `UI Promise <= Backend Capability`。

## 方案选择

### 方案 A：Snapshot 内严格 presentation 联合（采用）

增加 `JourneyPresentation` 判别联合，并以 `presentation.updated` Journey event 写入 reducer。Pupu 结果与 generic result 都由 Snapshot 表达，组件 registry 只读取 presentation。

优点：

- Snapshot 成为唯一业务状态源。
- App 不识别 tool、SSE part 或 capability 细节。
- 新 capability 只扩展联合与 registry。
- 保持现有 Journey 生命周期和 UI 组件。

### 方案 B：把 Pupu payload 塞进 JourneyResult（不采用）

实现较少，但会让通用结果模型持续吸收 capability 字段，组件扩展时类型边界退化。

### 方案 C：完全动态字符串 registry 与 unknown payload（不采用）

扩展性表面更高，但缺少编译期 payload/component 配对检查，对当前首版属于过度设计。

## 目标状态模型

```ts
type JourneyPresentation =
  | {
      capability: "pupu";
      component: "pupu.purchase-plan";
      mode: "canvas";
      dataSource: "live";
      payload: PupuPurchasePayload;
    }
  | {
      capability: "generic";
      component: "journey.result";
      mode: "canvas" | "inline" | "sheet";
      dataSource: "live";
      payload: JourneyResult;
    };
```

`JourneySnapshot` 新增：

```ts
presentation: JourneyPresentation | null;
runId: string | null;
```

`JourneyEvent` 新增：

```ts
{
  type: "presentation.updated";
  requestId: string;
  presentation: JourneyPresentation;
}
```

请求开始、重试和 reset 必须清空 presentation。错误或中断不能保留为当前成功 presentation。run 完成后只有已经通过校验的 presentation/result 才能进入 ready。

## 数据流

```text
Hermes SSE
  ↓
HermesRunEvent
  ↓
mapHermesEvent
  ↓
JourneyEvent（包含 presentation.updated）
  ↓
AI SDK data-journey
  ↓
journeyReducer
  ↓
JourneySnapshot
  ↓
JourneyPresentationRenderer
  ├─ pupu.purchase-plan → PupuPurchaseCard(readOnly)
  └─ default/generic → LiquidJourney
```

删除 `data-pupu`、`pupuEvent` state 和 App 内的 Pupu 条件分支。

`chat.status` 仅保留在 hook 内用于 transport 冲突处理，并暴露布尔 `transportBusy` 给 stop button。Header、Journey 生命周期和结果渲染只读 Snapshot。

## Presentation renderer

新增轻量 `JourneyPresentationRenderer`：

- 输入完整 `JourneySnapshot`。
- 当 `presentation.component === "pupu.purchase-plan"` 时渲染只读 Pupu 卡片。
- 其他情况渲染 LiquidJourney。
- App 只传 Snapshot 与通用 callback。
- registry 不接触 Hermes tool 名或 AI SDK part 类型。

## Pupu 金额语义

`PupuPurchasePayload` 改为：

```ts
estimatedTotal: number;
userBudget?: number;
```

删除业务代码对 `total` 与必填 `budget` 的依赖。若兼容旧 demo helper，仅在测试 fixture 层同步迁移，不把 demo event 接回生产链路。

UI 规则：

- 无明确预算：显示“预计合计 ¥12.90”，不渲染进度条。
- 有明确预算：显示“预计 ¥74.60 / 预算 ¥120”，并渲染有限、夹在 0–100% 的进度。
- `userBudget <= 0` 或非有限值按无预算处理。
- 金额必须是有限非负数；非法 payload 在 adapter/schema 层失败，不进入 live presentation。

本次 adapter 不从自然语言猜预算。只有受信任的上游结构化字段明确提供时才设置 `userBudget`。

## Artifact identity

Hermes 当前 plugin handler 能稳定取得 `task_id`，但未保证提供原始 `run_id` 与 `tool_call_id`。因此本次采用隔离替换点而非伪造完全关联。

服务端接口：

```ts
interface ToolArtifactIdentity {
  sessionId: string;
  runId: string;
  toolCallId: string;
  toolName: string;
  sequence: number;
}

readToolArtifact(identity): Promise<ToolArtifactRead>
```

artifact envelope 至少包含：

- `task_id`
- `tool_name`
- provider `request_id`
- 写入序列或唯一 artifact id
- validated result

读取器必须：

- 校验所有当前可验证字段。
- 不匹配、malformed、missing、stale 均返回明确状态，不把 null 当作成功结果。
- 读取后只删除已验证且被当前调用消费的文件。
- 支持连续两个 `tool.completed` 各自消费不同 artifact。
- 将未来直接使用 Hermes `tool_call_id` 的替换限制在 reader/writer 边界。

为避免 session 单文件覆盖，artifact 文件名使用安全的 task id 加单调序列或唯一 artifact id；服务端按 identity 与 sequence 消费。

## 测试分层

### Unit

覆盖：

- reducer presentation 生命周期与迟到事件。
- adapter 将 live Pupu envelope 映射为 Journey event。
- malformed/auth error 不产生 live presentation。
- budget 有/无/零值。
- artifact missing、identity mismatch、malformed、stale。
- 连续两个 tool completion。

### Integration

用受控 Hermes event 与真实 reducer 串联验证：

```text
Hermes event
→ adapter
→ Journey event
→ reducer
→ presentation
```

这里可以使用协议 fixture，但 fixture 必须显式标记为 contract data，不能伪装为 live E2E。

### Browser contract

允许受控 transport，分别验证：

- 成功 presentation。
- provider error。
- invalid result。
- interrupted。
- UI 状态、registry、无 mutation、reduced motion 和 source-anchored 布局。

### Live E2E

单独脚本和配置，直连 VPS Hermes 与真实 Pupu readonly plugin。成功路径必须同时断言：

- run 已创建且取得 run id。
- SSE 完成。
- Snapshot 最终为 ready。
- 收到 `pupu.purchase-plan`。
- `dataSource === "live"`。
- 至少一个真实商品及有效 provider product id。
- 页面无 error、无 demo/示例结果、无 mutation action。

登录或 provider 不可用时，live test 必须失败，或由预检明确报告 environment unavailable 并以非成功状态退出；不能把 error UI 计为通过。

## 首页能力边界

首页正文改为中性入口：

> 直接告诉我你的需求。

示例只保留当前真实只读能力，例如：

- 朴朴搜索商品
- 查看朴朴商品详情
- 查看朴朴购物车

删除快递、外卖、退款和天气的能力承诺。旧 QuickResultCard 可以保留给隔离组件测试，但不得从生产首页或实时任务链路触达。

## 密钥与运行配置

DeepSeek 测试密钥只保存于 VPS `/home/pupu/.hermes/.env`，权限 0600：

- 不进入 Git。
- 不出现在命令参数、进程列表、日志或测试快照。
- live test 输出只报告 key present/unset。
- Hermes gateway 更新密钥后必须重启，并重新验证 loopback health 与模型调用。

## 不变项

保留：

- dark/liquid glass 视觉。
- Motion transitions。
- JourneyOriginSurface。
- FloatingComposer。
- source-anchored 交互。
- reduced motion。
- mobile responsive。
- Hermes readonly disclosure。

不重新引入 ScreenPlan、ScreenProcessing、ScreenResting、CartDrawer 或静态 mock 业务结果。

## 验收报告

最终逐项报告：

1. 修改前问题。
2. 实际修改文件。
3. Journey 状态模型变化。
4. 删除的重复 state。
5. E2E 成功标准变化。
6. live 是否取得真实 Pupu 数据。
7. `npm run lint`。
8. `npm test`。
9. `npm run build`。
10. `npm run test:browser`。
11. 独立 live E2E。
12. 尚未解决问题。
