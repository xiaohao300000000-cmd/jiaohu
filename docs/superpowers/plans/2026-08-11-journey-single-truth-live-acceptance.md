# Journey Single Truth and Live Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make JourneySnapshot the only UI business-state source and ensure automated success means a real completed Hermes/Pupu result.

**Architecture:** All Hermes outputs become typed Journey events and pass through journeyReducer. A discriminated JourneyPresentation union drives a small renderer registry; artifact access is isolated behind identity-aware queue semantics; contract browser tests and real live E2E have separate commands and success criteria.

**Tech Stack:** React 19, TypeScript 5.8, Vercel AI SDK 7, Motion, Vitest, Playwright, Express, Hermes Agent, Python/Pydantic Pupu plugin.

## Global Constraints

- Keep `用户输入 → Vercel AI SDK → /api/chat → Hermes → SSE → Event Adapter → Journey UI`.
- Do not add simulated business data or weaken assertions.
- Do not upgrade dependencies.
- Preserve dark/liquid glass, Motion, JourneyOriginSurface, FloatingComposer, reduced motion and mobile layout.
- Keep Pupu tools read-only; no cart mutation, order, payment or login mutation in Hermes.
- Store DeepSeek key only in VPS `/home/pupu/.hermes/.env` mode 0600.
- Use small commits and RED→GREEN tests.

---

### Task 1: Journey Presentation Domain Model

**Files:**
- Modify: `src/components/journey/types.ts`
- Modify: `src/components/journey/journey-reducer.ts`
- Test: `src/components/journey/journey-reducer.test.ts`

**Interfaces:**
- Consumes: `PupuPurchasePayload`, `JourneyResult`.
- Produces: `JourneyPresentation`, `presentation.updated`, `JourneySnapshot.presentation`, `JourneySnapshot.runId`.

- [ ] **Step 1: Write failing reducer tests**

Add tests proving a live Pupu presentation enters Snapshot, request/retry clears it, error clears it, late request IDs cannot replace it, and stream completion preserves it while moving state to `ready`.

```ts
const presentation: JourneyPresentation = {
  capability: "pupu",
  component: "pupu.purchase-plan",
  mode: "canvas",
  dataSource: "live",
  payload: livePayload,
};
expect(
  journeyReducer(receiving, {
    type: "presentation.updated",
    requestId: "request-1",
    presentation,
  }).presentation,
).toEqual(presentation);
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/components/journey/journey-reducer.test.ts`
Expected: FAIL because `JourneyPresentation` and `presentation.updated` do not exist.

- [ ] **Step 3: Implement minimal typed model**

Add a strict discriminated union and fields:

```ts
export type JourneyPresentation =
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
      mode: PresentationMode;
      dataSource: "live";
      payload: JourneyResult;
    };
```

Reducer rules: `presentation.updated` sets `assembling`; `stream.finished` sets `ready`; request, retry, error and interruption clear stale successful presentation as defined in the design.

- [ ] **Step 4: Verify GREEN**

Run: `npx vitest run src/components/journey/journey-reducer.test.ts`
Expected: all reducer tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/journey/types.ts src/components/journey/journey-reducer.ts src/components/journey/journey-reducer.test.ts
git commit -m "refactor: make Journey own presentations"
```

### Task 2: Single AI SDK Data Protocol

**Files:**
- Modify: `src/ai/hermes-event-adapter.ts`
- Modify: `src/ai/journey-ui-message.ts`
- Modify: `server/chat-handler.ts`
- Test: `src/ai/hermes-event-adapter.test.ts`
- Test: `server/chat-handler.test.ts`
- Create: `src/ai/hermes-journey-integration.test.ts`

**Interfaces:**
- Consumes: `JourneyPresentation`, validated CLI envelope.
- Produces: `mapHermesEvent(...): JourneyEvent | null`; AI SDK only emits `data-journey`.

- [ ] **Step 1: Write failing adapter and integration tests**

Assert Pupu `tool.completed` maps to:

```ts
{
  type: "presentation.updated",
  requestId,
  presentation: {
    capability: "pupu",
    component: "pupu.purchase-plan",
    mode: "canvas",
    dataSource: "live",
    payload: expect.objectContaining({ estimatedTotal: 12.9 }),
  },
}
```

Feed mapped events through `journeyReducer` and assert final state `ready`, live presentation present, and malformed/auth failures never create one.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/ai/hermes-event-adapter.test.ts src/ai/hermes-journey-integration.test.ts server/chat-handler.test.ts`
Expected: FAIL because adapter still returns AgentUIEvent and server emits `data-pupu`.

- [ ] **Step 3: Remove the parallel protocol**

Make `JourneyUIMessage` data only:

```ts
export type JourneyUIMessage = UIMessage<
  { runId: string },
  { journey: JourneyEvent }
>;
```

Make adapter return `JourneyEvent | null`. Chat handler writes every mapped event as `data-journey` and contains no `isPupuEvent` or `data-pupu`.

- [ ] **Step 4: Verify GREEN**

Run the command from Step 2.
Expected: all selected tests pass and serialized stream contains no `data-pupu`.

- [ ] **Step 5: Commit**

```bash
git add src/ai/hermes-event-adapter.ts src/ai/journey-ui-message.ts src/ai/hermes-event-adapter.test.ts src/ai/hermes-journey-integration.test.ts server/chat-handler.ts server/chat-handler.test.ts
git commit -m "refactor: stream presentations through Journey"
```

### Task 3: Hook and Presentation Renderer

**Files:**
- Modify: `src/ai/useLiveJourney.ts`
- Modify: `src/ai/useLiveJourney.test.tsx`
- Create: `src/components/journey/JourneyPresentationRenderer.tsx`
- Create: `src/components/journey/JourneyPresentationRenderer.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: `JourneySnapshot.presentation`.
- Produces: `JourneyPresentationRenderer({ snapshot, onRetry })`; `useLiveJourney().transportBusy`.

- [ ] **Step 1: Write failing hook/renderer/App tests**

Assert hook has no `pupuEvent`, streamed presentation is stored only in Snapshot, reset clears it, renderer selects Pupu card from presentation, and App does not inspect capability-specific state.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/ai/useLiveJourney.test.tsx src/components/journey/JourneyPresentationRenderer.test.tsx src/App.test.tsx`
Expected: FAIL because hook returns `pupuEvent` and renderer is missing.

- [ ] **Step 3: Implement minimal renderer and hook change**

Delete `useState(pupuEvent)` and `data-pupu` handling. Return:

```ts
return {
  snapshot,
  transportBusy:
    chat.status === "submitted" || chat.status === "streaming",
  submit,
  stop,
  retry,
  reset,
};
```

Renderer switches on `snapshot.presentation?.component`; Pupu card is always `readOnly`; fallback is `LiquidJourney`. App uses renderer and only uses `transportBusy` for FloatingComposer stop control.

- [ ] **Step 4: Verify GREEN**

Run the Step 2 command.
Expected: selected tests pass; source scan finds no `pupuEvent` or `data-pupu`.

- [ ] **Step 5: Commit**

```bash
git add src/ai/useLiveJourney.ts src/ai/useLiveJourney.test.tsx src/components/journey/JourneyPresentationRenderer.tsx src/components/journey/JourneyPresentationRenderer.test.tsx src/App.tsx src/App.test.tsx
git commit -m "refactor: render UI from Journey snapshot"
```

### Task 4: Correct Pupu Amount Semantics

**Files:**
- Modify: `src/components/agent/agent-ui-event.ts`
- Modify: `src/components/agent/agent-ui-event.test.ts`
- Modify: `src/components/pupu/PupuPurchaseCard.tsx`
- Modify: `src/components/pupu/PupuPurchaseCard.test.tsx`
- Modify: `src/ai/hermes-event-adapter.ts`
- Modify related fixtures in tests.

**Interfaces:**
- Produces: `PupuPurchasePayload.estimatedTotal: number`, optional `userBudget?: number`.

- [ ] **Step 1: Write failing budget tests**

Cover no budget, valid budget, zero budget, non-finite budget and safe progress.

```ts
expect(screen.getByText("预计合计 ¥12.90")).toBeVisible();
expect(screen.queryByRole("progressbar")).toBeNull();
```

With budget:

```ts
expect(screen.getByText("预计 ¥74.60 / 预算 ¥120")).toBeVisible();
expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "62");
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/components/pupu/PupuPurchaseCard.test.tsx src/ai/hermes-event-adapter.test.ts`
Expected: FAIL because budget is required and always rendered.

- [ ] **Step 3: Implement semantic fields**

Adapter sets `estimatedTotal` from validated products and does not invent `userBudget`. Card computes progress only when both values are finite, estimated total is nonnegative and user budget is positive. Clamp percentage to 0–100.

- [ ] **Step 4: Verify GREEN**

Run the Step 2 command.
Expected: tests pass; no rendered `NaN%`, `Infinity%` or `0 / 0`.

- [ ] **Step 5: Commit**

```bash
git add src/components/agent/agent-ui-event.ts src/components/agent/agent-ui-event.test.ts src/components/pupu/PupuPurchaseCard.tsx src/components/pupu/PupuPurchaseCard.test.tsx src/ai/hermes-event-adapter.ts src/ai/hermes-event-adapter.test.ts
git commit -m "fix: separate estimated total from budget"
```

### Task 5: Identity-Aware Artifact Queue

**Files:**
- Modify: `hermes/plugins/pupu_readonly/provider.py`
- Modify: `hermes/plugins/pupu_readonly/__init__.py`
- Modify: `hermes/plugins/pupu_readonly/tests/test_provider.py`
- Modify: `server/hermes-client.ts`
- Modify: `server/hermes-client.test.ts`
- Modify: `server/chat-handler.ts`
- Modify: `server/chat-handler.test.ts`

**Interfaces:**
- Produces: `ToolArtifactIdentity`, `readToolArtifact(identity)`, artifact envelope `artifact_id/task_id/tool_name/sequence/created_at/result`.

- [ ] **Step 1: Write failing Python artifact queue tests**

Persist two results for the same task and assert two distinct 0600 files with sequence 1 and 2, correct tool names and timestamps. Assert unsafe ids fail.

- [ ] **Step 2: Write failing TypeScript reader tests**

Cover two consecutive completions, missing, task mismatch, tool mismatch, malformed and stale artifact. Reader returns:

```ts
type ToolArtifactRead =
  | { status: "found"; result: unknown; artifactId: string }
  | { status: "missing" | "mismatch" | "malformed" | "stale" };
```

- [ ] **Step 3: Verify RED**

Run:

```bash
PYTHONPATH=. /home/pupu/providers/pupu-cli/.venv/bin/python -m pytest hermes/plugins/pupu_readonly/tests/test_provider.py -q
npx vitest run server/hermes-client.test.ts server/chat-handler.test.ts
```

Expected: FAIL because writer overwrites `task_id.json` and reader accepts only session id.

- [ ] **Step 4: Implement queued writer and reader**

Use task-scoped monotonic sequence guarded by a lock in Python. File names contain safe task id, zero-padded sequence and artifact id. Persist optional run/tool call metadata when Hermes kwargs provide them. TypeScript scans only safe task candidates, validates identity and age, consumes exactly one matching artifact, and never deletes a mismatched fresh file.

Chat handler increments Pupu completion sequence and calls:

```ts
readToolArtifact({
  sessionId,
  runId,
  toolCallId: sourceEvent.tool_call_id,
  toolName: sourceEvent.tool_name,
  sequence,
});
```

Non-found status maps to `invalid_result`, not a successful empty output.

- [ ] **Step 5: Verify GREEN**

Run the Step 3 commands.
Expected: all selected Python and TypeScript tests pass.

- [ ] **Step 6: Commit**

```bash
git add hermes/plugins/pupu_readonly server/hermes-client.ts server/hermes-client.test.ts server/chat-handler.ts server/chat-handler.test.ts
git commit -m "fix: correlate Hermes tool artifacts"
```

### Task 6: Align Homepage Promise

**Files:**
- Modify: `src/components/home/AgentHome.tsx`
- Modify: `src/App.test.tsx`
- Modify/create: `src/components/home/AgentHome.test.tsx`
- Modify: `tests/liquid-journey.spec.ts`

**Interfaces:**
- Produces: homepage copy and examples limited to current Pupu read-only capabilities.

- [ ] **Step 1: Write failing copy tests**

Assert neutral body copy and exact examples:

```ts
expect(screen.getByText("直接告诉我你的需求。")).toBeVisible();
for (const label of ["朴朴搜索商品", "查看朴朴商品详情", "查看朴朴购物车"]) {
  expect(screen.getByRole("button", { name: label })).toBeVisible();
}
```

Assert production homepage contains no 快递、外卖、退款 or 天气 promise.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/App.test.tsx src/components/home/AgentHome.test.tsx`
Expected: FAIL on current over-broad copy/examples.

- [ ] **Step 3: Update only production copy/examples**

Keep layout and animation unchanged. Do not delete isolated demo components unless no production import remains.

- [ ] **Step 4: Verify GREEN**

Run Step 2 command.
Expected: tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/home/AgentHome.tsx src/components/home/AgentHome.test.tsx src/App.test.tsx tests/liquid-journey.spec.ts
git commit -m "fix: align homepage with live capabilities"
```

### Task 7: Split Browser Contract and Live E2E

**Files:**
- Modify: `tests/liquid-journey.spec.ts`
- Modify: `tests/source-anchored-visual.spec.ts`
- Create: `tests/live/pupu-live.spec.ts`
- Create: `playwright.live.config.ts`
- Modify: `playwright.config.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `npm run test:browser` for controlled UI contract and `npm run test:live` for real backend acceptance.

- [ ] **Step 1: Make current false-positive test fail**

Delete the sum-of-error/ready/card predicate. Success contract must require ready plus live Pupu presentation. Error contract separately requires alert and retry.

- [ ] **Step 2: Add explicit live test**

The live spec sends a real catalog request and asserts:

```ts
await expect(page.getByTestId("journey-origin")).toHaveAttribute(
  "data-journey-state",
  "ready",
);
await expect(page.locator('[data-component="pupu.purchase-plan"]')).toHaveAttribute(
  "data-source",
  "live",
);
expect(await page.locator("[data-provider-product-id]").count()).toBeGreaterThan(0);
await expect(page.getByRole("alert")).toHaveCount(0);
```

The test must not route/mock `/api/chat`.

- [ ] **Step 3: Add environment preflight**

Before live tests, check Hermes health, API auth, DeepSeek key presence and Pupu auth status. Missing login/key exits nonzero with `environment unavailable`; it never reports a pass.

- [ ] **Step 4: Run browser contract**

Run: `npm run test:browser`
Expected: all controlled UI state-machine tests pass.

- [ ] **Step 5: Run live test**

Run: `npm run test:live`
Expected before phone verification: nonzero environment unavailable due Pupu auth. After phone verification: real ready Pupu result passes.

- [ ] **Step 6: Commit**

```bash
git add tests playwright.config.ts playwright.live.config.ts package.json package-lock.json
git commit -m "test: separate contract and live acceptance"
```

### Task 8: Secure Provider Configuration and Full Verification

**Files:**
- Modify outside Git only: `/home/pupu/.hermes/.env`
- Deploy updated plugin to: `/home/pupu/.hermes/plugins/pupu_readonly`

**Interfaces:**
- Consumes: supplied DeepSeek test key and later user-assisted Pupu phone verification.
- Produces: restarted loopback Hermes gateway and live evidence.

- [ ] **Step 1: Store key without argv/history exposure**

Read the key over stdin into a shell builtin, replace only `DEEPSEEK_API_KEY` in the 0600 env file, and report only `DEEPSEEK_API_KEY=<set>`.

- [ ] **Step 2: Deploy plugin and restart Hermes**

Run `deploy/hermes/install-plugin.sh`, restart the foreground/service gateway, and verify:

```bash
curl -fsS http://127.0.0.1:8642/health
```

Expected: HTTP 200, Hermes v0.20.0.

- [ ] **Step 3: Verify DeepSeek independently**

Submit a minimal Hermes run that requires no Pupu mutation and assert it completes using `deepseek-v4-flash`. Do not print provider payloads containing secrets.

- [ ] **Step 4: Run full repository checks**

```bash
npm run lint
npm test
npm run build
npm run test:browser
PYTHONPATH=. /home/pupu/providers/pupu-cli/.venv/bin/python -m pytest hermes/plugins/pupu_readonly/tests -q
```

Expected: exit 0 for every command.

- [ ] **Step 5: Run live acceptance after phone verification**

Run: `npm run test:live`.
Expected: exit 0 only after a real live product presentation reaches ready.

- [ ] **Step 6: Audit secrets and diff**

Run `git diff --check`, confirm clean status after commits, scan tracked content for populated keys, and verify no secret appears in artifacts or logs.

- [ ] **Step 7: Publish only after evidence**

Push the branch and update GitHub `main` only after the requested report is complete and the user authorizes synchronization.
