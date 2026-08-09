# Agent Home Presentation System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed dinner demo shell with a mobile-first universal Agent home that renders lightweight answers below the input, complex journeys on the central canvas, and temporary or high-risk actions in a bottom sheet.

**Architecture:** Keep `JourneyState` as the lifecycle state machine and introduce an orthogonal `PresentationMode` contract. `App` owns the active presentation and universal composer; focused leaf components render the home, anchored card, canvas journey, and sheet while the existing reducer continues to model Vercel AI SDK events.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Motion 12 (`motion/react`), Vitest, Testing Library, Playwright.

## Global Constraints

- Mobile-first baseline is 390x844 and must still fit at 320x720 without horizontal overflow.
- Preserve `JourneyState`: `idle`, `receiving`, `reasoning`, `assembling`, `ready`, `awaiting_input`, `error`, `interrupted`.
- Lock motion constants to `quickSnappy = { type: "spring", stiffness: 400, damping: 25 }` and `groundedSettle = { type: "spring", stiffness: 180, damping: 24, mass: 1.2 }`.
- Use `motion/react`, honor reduced motion, and animate transform and opacity only.
- Do not add neon, fake backend claims, real ordering, or real payment behavior.
- Initial home heading is `今天想让我做什么？` with a visual weight near 500.
- Future Vercel AI SDK integration must be able to provide `presentationMode` directly; keyword resolution is demo-only.
- Every user message enters one core Agent; capability providers return facts and never choose layout.
- Pupu CLI remains an external provider boundary. The frontend must not contain CLI authentication, signing, or direct process execution.
- Live and demo data must be visibly distinguished. Provider failure must not silently fall back to demo products.
- Adding to the assistant cart is reversible and local; syncing the real Pupu cart requires explicit approval.

---

### Task 1: Presentation Contract and Demo Resolver

**Files:**
- Create: `src/components/home/presentation.ts`
- Create: `src/components/home/presentation.test.ts`

**Interfaces:**
- Produces: `PresentationMode`, `DemoTaskKind`, `TaskPresentation`, and `resolveDemoPresentation(input: string): TaskPresentation`.
- Consumers: `AgentHome.tsx` and `App.tsx` in later tasks.

- [ ] **Step 1: Write the failing resolver tests**

```ts
import { describe, expect, it } from "vitest";
import { resolveDemoPresentation } from "./presentation";

describe("resolveDemoPresentation", () => {
  it.each(["查一下我的快递", "外卖到哪了", "今天会下雨吗"])(
    "routes quick status request %s to anchored",
    (input) => expect(resolveDemoPresentation(input).mode).toBe("anchored"),
  );

  it.each(["今晚吃什么", "帮我做采购方案", "安排三个人的火锅"])(
    "routes multi-step request %s to canvas",
    (input) => expect(resolveDemoPresentation(input).mode).toBe("canvas"),
  );

  it.each(["确认退款", "帮我付款", "提交这个订单"])(
    "routes high-risk request %s to sheet",
    (input) => expect(resolveDemoPresentation(input).mode).toBe("sheet"),
  );

  it("defaults unknown requests to canvas", () => {
    expect(resolveDemoPresentation("帮我处理一下").mode).toBe("canvas");
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/components/home/presentation.test.ts`

Expected: FAIL because `./presentation` does not exist.

- [ ] **Step 3: Implement the typed demo resolver**

```ts
export type PresentationMode = "anchored" | "canvas" | "sheet";
export type DemoTaskKind = "parcel" | "delivery" | "weather" | "plan" | "approval";

export interface TaskPresentation {
  mode: PresentationMode;
  kind: DemoTaskKind;
  input: string;
}

const riskPattern = /退款|付款|支付|扣款|提交.*订单|下单/;
const quickPatterns: Array<[RegExp, DemoTaskKind]> = [
  [/快递|包裹|物流/, "parcel"],
  [/外卖|骑手|配送进度/, "delivery"],
  [/天气|下雨|温度/, "weather"],
];

export function resolveDemoPresentation(input: string): TaskPresentation {
  const normalized = input.trim();
  if (riskPattern.test(normalized)) return { mode: "sheet", kind: "approval", input: normalized };
  const quick = quickPatterns.find(([pattern]) => pattern.test(normalized));
  if (quick) return { mode: "anchored", kind: quick[1], input: normalized };
  return { mode: "canvas", kind: "plan", input: normalized };
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/components/home/presentation.test.ts`

Expected: 8 tests pass.

---

### Task 2: Mobile-First Home and Anchored Result

**Files:**
- Create: `src/components/home/AgentHome.tsx`
- Create: `src/components/home/AgentHome.test.tsx`
- Create: `src/components/home/QuickResultCard.tsx`
- Create: `src/components/home/agent-home.css`
- Modify: `src/App.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `TaskPresentation` and `resolveDemoPresentation` from Task 1.
- Produces: `AgentHome({ activeTask, onSubmit, onExampleSelect })` and `QuickResultCard({ kind })`.

- [ ] **Step 1: Write failing home behavior tests**

```tsx
it("starts as a universal home instead of autoplaying dinner", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "今天想让我做什么？" })).toBeVisible();
  expect(screen.queryByText("把需求变成今晚的安排")).not.toBeInTheDocument();
});

it("anchors parcel results directly below the composer", async () => {
  render(<App />);
  await userEvent.type(screen.getByLabelText("输入生活指令"), "查一下我的快递");
  await userEvent.click(screen.getByRole("button", { name: "发送指令" }));
  const composer = screen.getByTestId("home-composer");
  const result = await screen.findByTestId("anchored-result");
  expect(composer.compareDocumentPosition(result) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(result).toHaveTextContent("你的包裹正在派送");
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- src/App.test.tsx src/components/home/AgentHome.test.tsx`

Expected: FAIL because the universal home and anchored result do not exist.

- [ ] **Step 3: Implement `QuickResultCard` and `AgentHome`**

Use `AnimatePresence` with `JOURNEY_SPRINGS.quickSnappy`. Keep the composer mounted and place the result immediately after it:

```tsx
<form data-testid="home-composer" onSubmit={submit}>...</form>
<AnimatePresence mode="popLayout">
  {activeTask?.mode === "anchored" && (
    <motion.div
      data-testid="anchored-result"
      initial={{ opacity: 0, y: -10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.985 }}
      transition={JOURNEY_SPRINGS.quickSnappy}
    >
      <QuickResultCard kind={activeTask.kind} />
    </motion.div>
  )}
</AnimatePresence>
```

The parcel sample must visibly say `示例数据`, `你的包裹正在派送`, and `预计今天 14:30 前送达` so the mock is never presented as real provider data.

- [ ] **Step 4: Replace desktop-first demo shell in `App.tsx`**

Initialize `useJourneyDemo({ autoPlay: false })`. Store `TaskPresentation | null`, route submits through `resolveDemoPresentation`, and render the home by default. Keep `Pupu` as a reset control and remove `FRONTEND MOTION STUDY` and the top scenario switcher from the primary product surface.

- [ ] **Step 5: Add mobile-first CSS**

Use `min-height: 100dvh`, a 390px-first single column, 18-20px page gutters, a 500-weight heading, no neon, and no horizontal overflow. The anchored result expands in normal document flow below the composer; do not absolutely position it.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run: `npm test -- src/App.test.tsx src/components/home/AgentHome.test.tsx`

Expected: home and anchored-result tests pass.

---

### Task 3: Canvas and Bottom-Sheet Presentations

**Files:**
- Create: `src/components/home/TaskSheet.tsx`
- Create: `src/components/home/TaskSheet.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/journey/useJourneyDemo.ts`
- Modify: `src/components/journey/useJourneyDemo.test.tsx`
- Modify: `src/components/journey/liquid-journey.css`
- Modify: `src/components/home/agent-home.css`

**Interfaces:**
- Consumes: `TaskPresentation`, existing `LiquidJourney`, and existing approval/error callbacks.
- Produces: `startStandard(text?: string)` in `useJourneyDemo` and `TaskSheet({ open, children, onClose })`.

- [ ] **Step 1: Write failing custom-request and sheet tests**

```tsx
it("starts the canvas journey with the submitted request", () => {
  const { result } = renderHook(() => useJourneyDemo({ autoPlay: false }));
  act(() => result.current.startStandard("今晚两个人吃什么"));
  expect(result.current.snapshot.requestText).toBe("今晚两个人吃什么");
  expect(result.current.snapshot.state).toBe("receiving");
});

it("renders an accessible dismissible bottom sheet", async () => {
  const onClose = vi.fn();
  render(<TaskSheet open onClose={onClose}><p>确认退款</p></TaskSheet>);
  expect(screen.getByRole("dialog", { name: "需要你的确认" })).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "关闭确认面板" }));
  expect(onClose).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- src/components/journey/useJourneyDemo.test.tsx src/components/home/TaskSheet.test.tsx`

Expected: FAIL because `startStandard` and `TaskSheet` do not exist.

- [ ] **Step 3: Generalize standard demo startup**

Rename the public starter to `startStandard(text = defaultRequest)`, dispatch the supplied trimmed text, and preserve the current timer sequence. Update existing tests and calls from `playStandard` to `startStandard`.

- [ ] **Step 4: Implement the accessible sheet**

Render the sheet through `AnimatePresence`, use `role="dialog"`, `aria-modal="true"`, label it `需要你的确认`, close on backdrop and close button, and use `groundedSettle` for the panel while the backdrop uses `JOURNEY_TWEENS.veil`.

- [ ] **Step 5: Connect presentations in `App.tsx`**

- `canvas`: fade the home introduction, render `LiquidJourney`, and keep a docked composer for interruption.
- `sheet`: keep the home visible behind the backdrop, call the approval demo, and render `JourneyApproval` inside `TaskSheet` once `awaiting_input` arrives.
- submitting any new instruction exits the current presentation first and starts the resolved replacement mode.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run: `npm test -- src/components/journey/useJourneyDemo.test.tsx src/components/home/TaskSheet.test.tsx src/App.test.tsx`

Expected: custom request, sheet accessibility, canvas, and approval tests pass.

---

### Task 4: Browser Verification, Copy Audit, and VPS Sync

**Files:**
- Modify: `tests/liquid-journey.spec.ts`
- Modify: `docs/superpowers/specs/2026-08-10-agent-home-presentation-system.md` only if verified behavior differs from the approved contract.

**Interfaces:**
- Verifies all public behaviors from Tasks 1-3.

- [ ] **Step 1: Replace fixed-demo browser tests with mode tests**

Add Playwright coverage that runs at 390x844 and 320x720, submits each example, and asserts:

```ts
await page.getByLabel("输入生活指令").fill("查一下我的快递");
await page.getByRole("button", { name: "发送指令" }).click();
await expect(page.getByTestId("anchored-result")).toBeVisible();

await page.getByRole("link", { name: "Pupu 首页" }).click();
await page.getByLabel("输入生活指令").fill("今晚吃什么");
await page.getByRole("button", { name: "发送指令" }).click();
await expect(page.getByText("正在接收需求")).toBeVisible();

await page.getByRole("link", { name: "Pupu 首页" }).click();
await page.getByLabel("输入生活指令").fill("确认退款");
await page.getByRole("button", { name: "发送指令" }).click();
await expect(page.getByRole("dialog", { name: "需要你的确认" })).toBeVisible();
```

For every viewport assert `document.documentElement.scrollWidth <= clientWidth` and that the anchored card starts below the composer bounding box.

- [ ] **Step 2: Run full unit and component suite**

Run: `npm test`

Expected: all Vitest tests pass.

- [ ] **Step 3: Run typecheck and production build**

Run: `npm run lint && npm run build`

Expected: TypeScript exits 0 and Vite produces `dist/`.

- [ ] **Step 4: Run browser tests**

Run: `npm run test:browser`

Expected: all Playwright tests pass at desktop and both mobile widths.

- [ ] **Step 5: Perform the visual pre-flight**

Check 390x844 and 320x720 screenshots for: light heading weight, no neon, no clipped CTA, no overlapping card, no horizontal overflow, correct sheet safe-area spacing, and readable contrast. Search visible copy for `—` and `–`; expected count is zero.

- [ ] **Step 6: Sync to VPS and repeat verification**

Copy only source, tests, config, lockfile, and docs to `/home/pupu/vercel ai sdk`, excluding `.runtime`, `node_modules`, `dist`, and `.git`. On the VPS run its user-level Node runtime commands for `npm test`, `npm run lint`, and `npm run build`; expected exit status is 0 for all.

---

### Task 5: Core Agent UI Event Contract

**Files:**
- Create: `src/components/agent/agent-ui-event.ts`
- Create: `src/components/agent/agent-ui-event.test.ts`
- Modify: `src/components/home/presentation.ts`
- Modify: `src/components/home/presentation.test.ts`

**Interfaces:**
- Produces: `AgentUIEvent<TPayload>`, `AgentDataSource`, `AgentCapability`, `ProductSummary`, `PupuPurchasePayload`, and `createDemoPupuPurchaseEvent(input: string)`.
- Consumers: the Pupu purchase journey and future Vercel AI SDK adapter.

- [ ] **Step 1: Write failing contract tests**

```ts
it("creates an explicitly labeled Pupu demo event", () => {
  const event = createDemoPupuPurchaseEvent("两个人吃火锅，预算 120 元");
  expect(event).toMatchObject({
    capability: "pupu",
    intent: "pupu.purchase_plan",
    presentationMode: "canvas",
    component: "pupu.purchase-plan",
    dataSource: "demo",
  });
  expect(event.payload.products[0]).toMatchObject({
    productId: expect.any(String),
    imageUrl: expect.any(String),
    collectedAt: expect.any(String),
  });
});

it.each(["朴朴帮我买", "两个人今晚吃火锅，预算 120 元", "买牛奶和鸡蛋"])(
  "routes %s to the Pupu purchase canvas",
  (input) => expect(resolveDemoPresentation(input)).toMatchObject({ mode: "canvas", kind: "pupu_purchase" }),
);
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- src/components/agent/agent-ui-event.test.ts src/components/home/presentation.test.ts`

Expected: FAIL because the event contract and `pupu_purchase` task kind do not exist.

- [ ] **Step 3: Implement the typed event envelope and sample adapter**

```ts
export type AgentDataSource = "live" | "demo";
export type AgentCapability = "pupu" | "parcel" | "delivery" | "weather" | (string & {});

export interface AgentUIEvent<TPayload> {
  runId: string;
  capability: AgentCapability;
  intent: string;
  presentationMode: PresentationMode;
  component: string;
  state: JourneyState;
  dataSource: AgentDataSource;
  payload: TPayload;
  occurredAt: string;
}
```

Define `ProductSummary` exactly as the spec and a `PupuPurchasePayload` with `stage`, `title`, `summary`, `products`, `total`, `currency`, `cartVersion`, and `estimatedDelivery`. The sample factory returns three clearly demo-labeled products, including image URLs, without claiming a CLI call occurred.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test -- src/components/agent/agent-ui-event.test.ts src/components/home/presentation.test.ts`

Expected: all event and resolver tests pass.

### Task 6: Pupu Product Plan and Image Fallback

**Files:**
- Create: `src/components/pupu/PupuPurchaseCard.tsx`
- Create: `src/components/pupu/PupuPurchaseCard.test.tsx`
- Create: `src/components/pupu/pupu-purchase.css`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `AgentUIEvent<PupuPurchasePayload>`.
- Produces: `PupuPurchaseCard({ event, onAddToCart, onRetry })`.

- [ ] **Step 1: Write failing component tests**

```tsx
it("shows product facts, images, and the demo source", () => {
  render(<PupuPurchaseCard event={createDemoPupuPurchaseEvent("买火锅食材")} onAddToCart={() => {}} onRetry={() => {}} />);
  expect(screen.getByText("示例数据")).toBeVisible();
  expect(screen.getAllByRole("img", { name: /商品图/ })).toHaveLength(3);
  expect(screen.getByText(/合计 ¥/)).toBeVisible();
});

it("keeps the product readable when an image fails", () => {
  render(<PupuPurchaseCard event={createDemoPupuPurchaseEvent("买火锅食材")} onAddToCart={() => {}} onRetry={() => {}} />);
  fireEvent.error(screen.getAllByRole("img", { name: /商品图/ })[0]);
  expect(screen.getByLabelText("商品暂无图片")).toBeVisible();
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/components/pupu/PupuPurchaseCard.test.tsx`

Expected: FAIL because `PupuPurchaseCard` does not exist.

- [ ] **Step 3: Implement the mobile product plan card**

Render a compact source badge, title, summary, horizontally readable product rows, price total, delivery estimate, and `加入购物车` button. Keep every product name and price visible when the image fails. Use a component-local `failedImages: Set<string>` to replace broken images with an icon fallback.

- [ ] **Step 4: Connect the Pupu purchase intent in `App.tsx`**

When `kind === "pupu_purchase"`, create the demo event and render `PupuPurchaseCard` on the canvas instead of the generic dinner result. Keep the canvas composer after the card in normal flow.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npm test -- src/components/pupu/PupuPurchaseCard.test.tsx src/App.test.tsx`

Expected: product card, source label, image fallback, and Pupu canvas tests pass.

### Task 7: Assistant Cart Transition and Real-Cart Approval

**Files:**
- Create: `src/components/pupu/PupuCartCard.tsx`
- Create: `src/components/pupu/PupuCartCard.test.tsx`
- Modify: `src/components/pupu/PupuPurchaseCard.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/home/TaskSheet.tsx`

**Interfaces:**
- Consumes: `PupuPurchasePayload` and `JourneyApproval`.
- Produces: `PupuCartCard({ payload, onCheckout })`; `onCheckout` opens `sheet + awaiting_input` without performing a provider mutation.

- [ ] **Step 1: Write failing cart-flow tests**

```tsx
it("turns a purchase plan into a versioned assistant cart", async () => {
  render(<App />);
  await userEvent.click(screen.getByRole("button", { name: "朴朴帮我买" }));
  await userEvent.click(await screen.findByRole("button", { name: "加入购物车" }));
  expect(await screen.findByText("已加入助手购物车")).toBeVisible();
  expect(screen.getByText("购物车版本 v1")).toBeVisible();
});

it("requires approval before syncing the real Pupu cart", async () => {
  render(<App />);
  await userEvent.click(screen.getByRole("button", { name: "朴朴帮我买" }));
  await userEvent.click(await screen.findByRole("button", { name: "加入购物车" }));
  await userEvent.click(screen.getByRole("button", { name: "同步到朴朴购物车" }));
  expect(await screen.findByRole("dialog", { name: "需要你的确认" })).toBeVisible();
  expect(screen.getByText(/确认同步到朴朴购物车/)).toBeVisible();
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- src/components/pupu/PupuCartCard.test.tsx src/App.test.tsx`

Expected: FAIL because the assistant cart view and sync approval do not exist.

- [ ] **Step 3: Implement the cart morph**

Use `AnimatePresence mode="wait"` and shared `layoutId` values so the plan card settles into `PupuCartCard`. Show item count, total, `购物车版本 v1`, adjustment affordances, and `同步到朴朴购物车`. Do not show copy that says the real cart was updated.

- [ ] **Step 4: Reuse the approval sheet for sync intent**

Create approval copy with target `助手购物车 v1 · 未连接真实账户`, the exact total, and impact text `确认后才允许能力提供方尝试同步；当前演示不会修改真实朴朴购物车。`. A successful demo hold closes the sheet and returns to the assistant cart with an explicit `演示确认完成，未执行真实同步` status.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npm test -- src/components/pupu/PupuCartCard.test.tsx src/App.test.tsx src/components/journey/JourneyExceptionalStates.test.tsx`

Expected: cart transition, approval sheet, and long-hold behaviors pass.

### Task 8: Mobile Browser Proof and VPS Delivery

**Files:**
- Modify: `tests/liquid-journey.spec.ts`
- Modify: `docs/superpowers/specs/2026-08-10-agent-home-presentation-system.md` only if browser-observed behavior requires a truthful correction.

**Interfaces:**
- Verifies Tasks 5-7 and preserves all earlier presentation behaviors.

- [ ] **Step 1: Add a failing Pupu browser journey**

At 390x844, click `朴朴帮我买`, assert the source badge, product image or fallback, and that the product plan does not overlap the canvas composer. Click `加入购物车`, assert `购物车版本 v1`, then click `同步到朴朴购物车` and assert the approval sheet. Repeat overflow measurement at 320x720.

- [ ] **Step 2: Run Playwright and verify RED before production wiring is complete**

Run: `npm run test:browser -- --grep "Pupu purchase"`

Expected: FAIL at the first missing Pupu purchase assertion.

- [ ] **Step 3: Complete responsive CSS and verify GREEN**

Keep card content in document flow, product thumbnails at 64-72px, controls at least 44px high, and use the two locked spring constants. Ensure `scrollWidth <= clientWidth` and composer top is at or below the card bottom.

- [ ] **Step 4: Run the complete local verification set**

Run: `npm test && npm run lint && npm run build && npm run test:browser`

Expected: every command exits 0 with no test failures.

- [ ] **Step 5: Inspect settled screenshots**

Capture the home, Pupu product plan, assistant cart, and approval sheet at 390x844. Verify light typography, no neon, readable source labels, no clipping, and no overlap.

- [ ] **Step 6: Sync and verify the VPS target**

Rsync the project to `/home/pupu/vercel ai sdk`, excluding `.git`, `.runtime`, `node_modules`, `dist`, `test-results`, and `playwright-report`. Run `npm test && npm run lint && npm run build` with the VPS project runtime and record the exact result. Do not claim real CLI integration or real cart mutation.
