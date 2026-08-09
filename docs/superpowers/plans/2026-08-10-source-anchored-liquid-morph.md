# Source-Anchored Liquid Morph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the universal Agent home into one continuous source-anchored task object, with an Agent-first Pupu decision summary, a floating glass composer, performant shared-layout motion, and a fully accessible approval sheet.

**Architecture:** `App` keeps one persistent `LayoutGroup`; `JourneyOriginSurface` owns the shared `journey-origin` and request-text nodes while stage content grows inside it. Pupu decisions render above a collapsible evidence layer, and `FloatingComposer` remains a separate fixed Z layer. Static glass presets provide blur while Motion animates only transform and opacity.

**Tech Stack:** React 19, TypeScript 5.8, Motion 12 (`motion/react`), CSS backdrop filters, Vitest, Testing Library, Playwright.

## Global Constraints

- Mobile baselines are 320x720 and 390x844.
- Remove the 36px奶白 Canvas mother card; Canvas is transparent space.
- Preserve the original input as a visible source sentence through every complex-task stage.
- Animate only transform and opacity; never animate `filter`, `backdrop-filter`, or blur CSS variables.
- Keep only `quickSnappy` and `groundedSettle` as global springs.
- Pupu ready state leads with decision facts; products are a collapsible evidence layer.
- Floating composer sits above the safe area and content scrolls behind it.
- Sheet requires auto-focus, focus trap, Escape close, inert background, and focus restoration.
- Automated browser checks are structural gates; real iPhone Safari remains a separately reported manual gate.

---

### Task 1: Persistent Journey Origin

**Files:**
- Create: `src/components/journey/JourneyOriginSurface.tsx`
- Create: `src/components/journey/JourneyOriginSurface.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/home/AgentHome.tsx`
- Modify: `src/components/journey/LiquidJourney.tsx`

**Interfaces:**
- Produces: `JourneyOriginSurface({ requestText, state, children })` with stable `layoutId="journey-origin"` and `layoutId="journey-request-text"`.
- Consumers: generic Liquid Journey and Pupu purchase flow.

- [ ] **Step 1: Write the failing continuity tests**

```tsx
it("keeps the submitted sentence as the source of the task object", async () => {
  render(<App />);
  await userEvent.type(screen.getByLabelText("输入生活指令"), "两个人今晚火锅，120以内");
  await userEvent.click(screen.getByRole("button", { name: "发送指令" }));
  expect(await screen.findByText("来自你的输入")).toBeInTheDocument();
  expect(screen.getByText("两个人今晚火锅，120以内")).toBeInTheDocument();
  expect(screen.getByTestId("journey-origin")).toHaveAttribute("data-layout-id", "journey-origin");
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/components/journey/JourneyOriginSurface.test.tsx src/App.test.tsx`

Expected: FAIL because the persistent origin component and source label do not exist.

- [ ] **Step 3: Implement the shared origin and remove page-level wait mode**

```tsx
<LayoutGroup id="agent-journey">
  <motion.article layout layoutId="journey-origin" data-testid="journey-origin" data-layout-id="journey-origin">
    <motion.p layoutId="journey-request-text">{requestText}</motion.p>
    {children}
  </motion.article>
</LayoutGroup>
```

Keep the home and task space in one tree. Do not wrap the entire page switch in `AnimatePresence mode="wait"`.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/components/journey/JourneyOriginSurface.test.tsx src/App.test.tsx`

Expected: continuity and existing home tests pass.

### Task 2: Agent-First Pupu Decision Surface

**Files:**
- Modify: `src/components/agent/agent-ui-event.ts`
- Modify: `src/components/agent/agent-ui-event.test.ts`
- Modify: `src/components/pupu/PupuPurchaseCard.tsx`
- Modify: `src/components/pupu/PupuPurchaseCard.test.tsx`
- Modify: `src/components/pupu/pupu-purchase.css`

**Interfaces:**
- Extends `PupuPurchasePayload` with `meal`, `people`, `budget`, `constraints`, and `decisionSummary`.
- Produces a collapsed evidence control labeled `查看商品证据（3 件）`.

- [ ] **Step 1: Write failing decision-hierarchy tests**

```tsx
it("leads with the Agent decision and keeps products as evidence", async () => {
  render(<PupuPurchaseCard event={createDemoPupuPurchaseEvent("两个人今晚火锅，120以内")} onAddToCart={() => {}} />);
  expect(screen.getByText("火锅 · 2 人")).toBeVisible();
  expect(screen.getByText("¥74.60 / ¥120")).toBeVisible();
  expect(screen.getByText("不辣")).toBeVisible();
  expect(screen.queryByText("谷饲肥牛卷")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "查看商品证据（3 件）" }));
  expect(screen.getByText("谷饲肥牛卷")).toBeVisible();
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/components/agent/agent-ui-event.test.ts src/components/pupu/PupuPurchaseCard.test.tsx`

Expected: FAIL because decision fields and collapsed evidence do not exist.

- [ ] **Step 3: Implement the decision summary and evidence disclosure**

Render decision facts first, a budget progress mark, constraint labels, then the decision summary. Products mount only when the native button toggles `aria-expanded=true`.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/components/agent/agent-ui-event.test.ts src/components/pupu/PupuPurchaseCard.test.tsx src/App.test.tsx`

Expected: decision hierarchy, evidence disclosure, and cart flow pass.

### Task 3: Floating Composer and Open Canvas

**Files:**
- Create: `src/components/home/FloatingComposer.tsx`
- Create: `src/components/home/FloatingComposer.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/index.css`
- Modify: `src/components/journey/liquid-journey.css`

**Interfaces:**
- Produces: `FloatingComposer({ onSubmit })` with `.floating-composer`.
- Task scroll container exposes `data-testid="task-scroll-space"`.

- [ ] **Step 1: Write failing layer tests**

```tsx
it("keeps the task composer in a separate floating layer", async () => {
  render(<App />);
  await openComplexTask();
  const composer = screen.getByTestId("floating-composer");
  expect(composer).toHaveClass("floating-composer");
  expect(composer.closest('[data-testid="journey-origin"]')).toBeNull();
  expect(screen.getByTestId("task-scroll-space")).toBeInTheDocument();
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/components/home/FloatingComposer.test.tsx src/App.test.tsx`

Expected: FAIL because the floating layer does not exist.

- [ ] **Step 3: Implement the open Canvas and floating layer**

Delete Canvas mother-card fill, border, radius, and shadow. Position the composer above `env(safe-area-inset-bottom)` and reserve matching scroll padding. Keep background content visible behind its static glass preset.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/components/home/FloatingComposer.test.tsx src/App.test.tsx`

Expected: layer ownership and existing interaction tests pass.

### Task 4: Motion Contract Cleanup

**Files:**
- Create: `src/config/motion-contract.test.ts`
- Modify: `src/components/journey/JourneyTrace.tsx`
- Modify: `src/components/journey/JourneyResultStack.tsx`
- Modify: `src/components/journey/LiquidJourney.tsx`
- Modify: `src/components/journey/liquid-journey.css`

**Interfaces:**
- Produces a source-level contract test rejecting animated blur declarations.

- [ ] **Step 1: Write the failing contract test**

```ts
it("does not animate filter or backdrop blur", () => {
  const sources = readJourneySources();
  expect(sources).not.toMatch(/initial=\{\{[^}]*filter:/s);
  expect(sources).not.toMatch(/animate=\{\{[^}]*filter:/s);
  expect(sources).not.toMatch(/exit=\{\{[^}]*filter:/s);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/config/motion-contract.test.ts`

Expected: FAIL on existing `filter: "blur(...)"` keyframes.

- [ ] **Step 3: Remove animated filters and use shared layout**

Remove every animated `filter` property. Use `layout`, shared `layoutId`, transform offsets, scale, and opacity. Static backdrop blur remains in CSS presets only.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/config/motion-contract.test.ts src/components/journey/LiquidJourney.test.tsx`

Expected: motion contract and journey rendering pass.

### Task 5: Accessible Sheet Focus Lifecycle

**Files:**
- Modify: `src/components/home/TaskSheet.tsx`
- Modify: `src/components/home/TaskSheet.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- `TaskSheet` handles auto-focus, Tab loop, Escape, background inert callback, scroll lock, and focus restoration.

- [ ] **Step 1: Write failing keyboard tests**

```tsx
it("traps focus, closes on Escape, and restores the trigger", async () => {
  trigger.focus();
  await user.click(trigger);
  expect(closeButton).toHaveFocus();
  await user.keyboard("{Shift>}{Tab}{/Shift}");
  expect(lastAction).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalledOnce();
  expect(trigger).toHaveFocus();
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/components/home/TaskSheet.test.tsx`

Expected: FAIL because focus lifecycle and Escape behavior are missing.

- [ ] **Step 3: Implement focus lifecycle**

Store the opener, focus the close button when mounted, cycle among visible focusable nodes, close on Escape, restore opener on unmount, lock document overflow, and mark the app shell inert while open.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- src/components/home/TaskSheet.test.tsx src/App.test.tsx`

Expected: focus lifecycle and approval flows pass.

### Task 6: Experience Gates and Visual Proof

**Files:**
- Modify: `tests/liquid-journey.spec.ts`
- Create: `tests/source-anchored-visual.spec.ts`

**Interfaces:**
- Verifies source continuity, decision hierarchy, long input, touch scroll, floating overlap, focus lifecycle, and key screenshot states.

- [ ] **Step 1: Add failing browser assertions**

Assert the source sentence persists, product evidence starts collapsed, content passes behind the floating composer without hiding the final action, long text wraps, sheet focus stays trapped, and no animated filter is present.

- [ ] **Step 2: Run the browser suite and verify RED for missing behaviors**

Run: `npm run test:browser`

Expected: new source continuity, hierarchy, focus, and floating-layer assertions fail before implementation.

- [ ] **Step 3: Complete responsive fixes and screenshot captures**

Capture settled 390x844 states for origin, reasoning, decision summary, evidence expanded, assistant cart, and approval sheet. Run the same geometry checks at 320x720 and with a long input.

- [ ] **Step 4: Run full verification**

Run: `npm test && npm run lint && npm run build && npm run test:browser`

Expected: all commands exit 0.

- [ ] **Step 5: Perform manual visual review**

Inspect every screenshot for source continuity, Agent-first hierarchy, transparent Canvas, material overlap behind the floating composer, no clipped actions, readable contrast, and no ecommerce-list-first composition. Report real iPhone Safari and PWA standalone as unverified unless run on physical hardware.

- [ ] **Step 6: Commit, push, and update VPS**

Commit source, tests, screenshots configuration, spec, and plan to `codex/liquid-journey-motion`; push the existing PR branch. Sync the same verified source to `/home/pupu/vercel ai sdk` and rerun `npm test`, `npm run lint`, and `npm run build` on the VPS.
