# Task Capability Routing Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace frontend/Hermes intent guessing with one versioned server-side task state and enforce cart/order permissions from that state.

**Architecture:** A shared `TaskSnapshot` contract is owned by a server `TaskCoordinator`. `/api/chat` resolves or resumes one task, emits `task.updated`, and builds Hermes instructions from allowed capabilities. Pupu commerce endpoints consult the same coordinator before preview or mutation; existing provider controllers remain responsible for previews, idempotency, readback, and payment-link validation.

**Tech Stack:** TypeScript 5.8, React 19, Vercel AI SDK 7, Express 5, Vitest 3, Playwright.

## Global Constraints

- All project writes occur only in `/home/pupu/.worktrees/jiaohu-task-route-center` on VPS.
- Keep one composer and one Journey; do not add a second chat surface.
- Do not call live cart, order, invite-pay, payment, or other mutation APIs during implementation verification.
- The external Pupu CLI remains a provider boundary.
- Tests precede production code and each RED failure must be observed.
- Natural-language confirmation never authorizes cart or order mutation.

---

### Task 1: Restore a trustworthy baseline

**Files:**
- Modify: `src/ai/useLiveJourney.test.tsx`
- Modify: `deploy/hermes/deploy-contract.test.ts`

**Interfaces:**
- Consumes: current AI SDK fetch calls and deployed 150-second Pupu timeout.
- Produces: a green pre-feature test baseline without production behavior changes.

- [ ] Update the transport test helper to read JSON from either `Request` or `RequestInit.body`.
- [ ] Change the stale deployment assertion from `PUPU_TOOL_TIMEOUT_SECONDS=75` to the installed value `150`.
- [ ] Run `npx vitest run src/ai/useLiveJourney.test.tsx deploy/hermes/deploy-contract.test.ts --maxWorkers=1`; expect 6 passing tests.
- [ ] Run `npm run lint`; expect exit 0.
- [ ] Commit `test: restore task routing baseline`.

### Task 2: Add the shared task contract and coordinator

**Files:**
- Create: `src/domain/task-contract.ts`
- Create: `server/tasks/task-coordinator.ts`
- Create: `server/tasks/task-coordinator.test.ts`

**Interfaces:**
- Produces: `TaskSnapshot`, `TaskCapability`, `TaskAction`, `TaskCoordinator.resolve`, `TaskCoordinator.resume`, `TaskCoordinator.transition`, `TaskCoordinator.attachProducts`, and `TaskConflictError`.

- [ ] Write failing tests proving one resolver owns general advice, single-product search, meal search, cart read, task continuation, people count, budget, dietary requirements, quantity changes, preview invalidation, version conflicts, and illegal transitions.
- [ ] Run `npx vitest run server/tasks/task-coordinator.test.ts --maxWorkers=1`; expect module-not-found RED.
- [ ] Implement the shared discriminated types and an in-memory coordinator with server-generated task IDs and monotonically increasing versions.
- [ ] Centralize lexical fallback rules only inside `TaskCoordinator`; no consumer receives or re-runs these regexes.
- [ ] Run the targeted test; expect all coordinator tests green.
- [ ] Commit `feat: add centralized task state coordinator`.

### Task 3: Emit the task snapshot through Journey

**Files:**
- Modify: `src/components/journey/types.ts`
- Modify: `src/components/journey/journey-reducer.ts`
- Modify: `src/components/journey/journey-reducer.test.ts`
- Modify: `src/ai/hermes-event-adapter.ts`

**Interfaces:**
- Consumes: `TaskSnapshot`.
- Produces: `JourneyEvent { type: "task.updated" }` and `JourneySnapshot.task`.

- [ ] Add RED reducer tests: accept the active task update, ignore another request ID, retain task across login/address presentations, and clear it on reset.
- [ ] Run the reducer test; expect missing union member/property failures.
- [ ] Add `task.updated` and project its phase without allowing later generic trace events to overwrite `awaiting_login`, `awaiting_address`, or confirmation phases.
- [ ] Run targeted reducer and adapter tests; expect green.
- [ ] Commit `feat: project task state into Journey`.

### Task 4: Make `/api/chat` the only task decision entry

**Files:**
- Modify: `server/chat-handler.ts`
- Modify: `server/chat-handler.test.ts`
- Modify: `server/chat-scope.test.ts`
- Modify: `server/index.ts`
- Create: `server/tasks/hermes-task-contract.ts`
- Create: `server/tasks/hermes-task-contract.test.ts`

**Interfaces:**
- Consumes: `{ input, taskId?, resume? }`, `TaskCoordinator`, and Pupu session/address readiness.
- Produces: `task.updated`, deterministic login/address presentation, and Hermes input derived only from `TaskSnapshot.allowedCapabilities`.

- [ ] Add RED tests showing request bodies no longer accept `pupuIntent`, ordinary advice never prepares scope, commerce creates one task, resume reuses it without reclassification, missing login/address stops before Hermes, and allowed capability chooses exactly one tool contract.
- [ ] Run the targeted server tests; expect failures against the old `pupuIntent` flow.
- [ ] Replace `hermesInput(input, pupuIntent)` with `buildHermesTaskContract(task)` and structured task dependencies.
- [ ] Inject one `TaskCoordinator` from `server/index.ts`; inspect cookie/session/address before issuing scope.
- [ ] Run chat, scope, contract, login, and address tests; expect green.
- [ ] Commit `feat: route chat through task coordinator`.

### Task 5: Remove frontend task classification

**Files:**
- Modify: `src/ai/useLiveJourney.ts`
- Modify: `src/ai/useLiveJourney.test.tsx`
- Modify: `src/ai/useLiveJourney.login.test.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/components/home/presentation.ts`
- Modify: `src/components/home/presentation.test.ts`

**Interfaces:**
- Consumes: `JourneySnapshot.task` and `task.updated`.
- Produces: raw text plus optional `taskId/resume`, automatic login/address presentation from server phase, and a single composer.

- [ ] Add RED tests proving all inputs first go to `/api/chat`, request bodies omit `pupuIntent`, `awaiting_login` activates the existing login Journey, `awaiting_address` loads addresses, and resume sends taskId with `resume: true`.
- [ ] Run targeted hook/App tests; expect old `isPupuTask` behavior to fail.
- [ ] Remove `isPupuTask` from production routing; keep `resolveDemoPresentation` only for isolated demo tests or delete obsolete Pupu routing cases.
- [ ] Keep local refs only for transport coordination; task facts and phase come from the server snapshot.
- [ ] Run hook, App, presentation, login, and address tests; expect green.
- [ ] Commit `refactor: consume server task routing in frontend`.

### Task 6: Bind scope tickets and provider tools to task policy

**Files:**
- Modify: `server/pupu/scope-ticket.ts`
- Modify: `server/pupu/scope-ticket.test.ts`
- Modify: `hermes/plugins/pupu_readonly/scope_ticket.py`
- Modify: `hermes/plugins/pupu_readonly/provider.py`
- Modify: `hermes/plugins/pupu_readonly/tests/test_scope_ticket.py`
- Modify: `hermes/plugins/pupu_readonly/tests/test_scope_plugin.py`

**Interfaces:**
- Consumes: taskId, taskVersion, `TaskCapability[]`.
- Produces: trusted scope with allowed operations; provider rejects operations absent from the ticket before starting CLI.

- [ ] Add RED TypeScript and Python tests for task/version mismatch, capability denial, expiry, malformed tickets, and valid single/meal/cart-read operations.
- [ ] Run targeted Vitest and pytest; expect missing policy fields RED.
- [ ] Extend ticket schema and map generic capabilities to exact read-only plugin operations.
- [ ] Run targeted TypeScript and Python tests; expect green and zero CLI starts on denied operations.
- [ ] Commit `feat: bind Pupu scope to task capabilities`.

### Task 7: Enforce task phase on cart and checkout endpoints

**Files:**
- Modify: `server/pupu/commerce-router.ts`
- Modify: `server/pupu/commerce-router.test.ts`
- Modify: `server/pupu/cart-controller.ts`
- Modify: `server/pupu/checkout-controller.ts`
- Modify: `src/ai/pupu-commerce-client.ts`
- Modify: `src/components/pupu/PupuPurchaseCard.tsx`
- Modify: `src/components/pupu/PupuCartConfirmCard.tsx`
- Modify: `src/components/pupu/PupuCheckoutJourney.tsx`
- Modify: associated component/controller tests.

**Interfaces:**
- Consumes: taskId, taskVersion, preview IDs, idempotency keys, and explicit UI actions.
- Produces: legal transitions `awaiting_cart_confirmation → writing_cart → awaiting_order_confirmation → creating_order → awaiting_payment`.

- [ ] Add RED router tests proving preview/commit/order calls fail with 409 before the legal phase and do not invoke controllers.
- [ ] Add RED component/client tests proving every call sends taskId/version and refreshes from returned task state.
- [ ] Run targeted tests; expect missing task policy RED.
- [ ] Guard each route with coordinator assertions; record preview IDs in task context; transition only after verified controller success.
- [ ] Keep component state only for pending/error visuals, not authoritative business phase.
- [ ] Run commerce router, cart, checkout, client, and component tests; expect green.
- [ ] Commit `feat: enforce task phase for commerce mutations`.

### Task 8: Remove duplicate classifiers and verify end to end

**Files:**
- Delete: `server/pupu/request-classifier.ts`
- Delete: `server/pupu/request-classifier.test.ts`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-08-14-task-capability-routing-center-design.md` only if implementation names differ.

**Interfaces:**
- Produces: one documented routing center and no production `pupuIntent`, `isPupuTask`, `isComplexMealRequest`, or cart-read regex.

- [ ] Add an architecture test that scans production files and fails if removed routing symbols return.
- [ ] Run it before deletion; expect RED.
- [ ] Delete obsolete classifier code and update README flow and safety matrix.
- [ ] Run `npm run lint`, `npx vitest run --maxWorkers=1`, `npm run build`, and the read-only browser contract suite.
- [ ] Run repository searches for duplicate routing symbols and review `git diff --check`.
- [ ] Do not run `test:live` or real commerce mutation acceptance in this implementation pass.
- [ ] Commit `docs: record centralized task capability routing`.
