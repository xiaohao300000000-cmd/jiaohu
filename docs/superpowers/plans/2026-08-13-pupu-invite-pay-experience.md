# Pupu Official Invite-Pay Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a real address-bound Pupu shopping flow that turns a complex meal request into live products, guarded cart writes, a revalidated pending-payment order, and a clickable official invite-pay destination without automatic payment.

**Architecture:** Keep Hermes/DeepSeek responsible only for planning and read-only discovery. A deterministic server-side commerce controller resolves the cookie-bound account and selected saved address, issues short-lived read scopes for one Hermes run, and owns every mutation through explicit versioned confirmations. Reuse the external Pupu CLI for receiver, cart, settlement, approval, order, invite-pay, and status operations; expose only redacted typed presentations to React.

**Tech Stack:** TypeScript 5.8, Express 5, React 19, Vercel AI SDK 7, Zod 4, Vitest, Playwright, Python 3.12 Hermes plugin, external Pupu CLI.

## Global Constraints

- All repository changes and project commands run in `/home/pupu/.worktrees/jiaohu-journey-single-truth` on `pupu-vps`; do not write project files to the Mac.
- Preserve current Pupu authentication after tests; do not log out or delete auth.
- Use only saved Pupu addresses in v1; do not create or edit an address.
- Never expose phone, OTP, full address, encrypted coordinates, auth, approval token, order secrets, or payment URL to DeepSeek or public logs.
- No automatic payment and no final payment click; the user decides on the official Pupu surface.
- A rendered button passes live acceptance only when it opens the official pending-payment destination for the current real order.
- Complex-demand stability is three consecutive live runs: two read-only, then one approved cart/order/invite-pay run.
- Every mutation needs deterministic account/address binding, an idempotency key, explicit user confirmation, and readback/reconciliation.

---

### Task 1: Run-Scoped Concurrent Pupu Authorization

**Files:**
- Modify: `hermes/plugins/pupu_readonly/scope_ticket.py`
- Modify: `hermes/plugins/pupu_readonly/tests/test_scope_ticket.py`
- Modify: `hermes/plugins/pupu_readonly/tests/test_scope_plugin.py`
- Modify: `server/pupu/scope-ticket.ts`
- Modify: `server/pupu/scope-ticket.test.ts`
- Modify: `server/chat-handler.ts`

**Interfaces:**
- Consumes: server-issued mode-0600 ticket keyed by `taskId`.
- Produces: `read_scope_ticket(root: Path, task_id: str) -> TrustedPupuScope`; valid within one run until cleanup/expiry, safe for concurrent read-only tools.

- [ ] Add failing Python tests proving two sequential and two concurrent reads return the same scope, while expired, symlinked, malformed, cross-task, and wrong-mode tickets fail closed.
- [ ] Run `/home/pupu/providers/pupu-cli/.venv/bin/python -m pytest -q hermes/plugins/pupu_readonly/tests/test_scope_ticket.py hermes/plugins/pupu_readonly/tests/test_scope_plugin.py`; expect the reuse tests to fail with `scope ticket missing`.
- [ ] Implement descriptor-based `O_NOFOLLOW` regular-file reads with permission, identity, allowlist, nonce, and expiry validation; retain valid tickets and delete invalid tickets.
- [ ] Add TypeScript tests proving `cleanupPupuScope(taskId)` deletes exactly the completed/cancelled run ticket and an expiry sweep deletes only expired tickets.
- [ ] Run focused Python/Vitest suites and commit `fix: scope pupu tools to one agent run`.

### Task 2: Saved Address Discovery and Selection

**Files:**
- Create: `server/pupu/commerce-types.ts`
- Create: `server/pupu/commerce-cli.ts`
- Create: `server/pupu/commerce-cli.test.ts`
- Create: `server/pupu/address-controller.ts`
- Create: `server/pupu/address-controller.test.ts`
- Create: `server/pupu/address-router.ts`
- Modify: `server/index.ts`

**Interfaces:**
- Produces: `SavedAddressSummary { id; label; region; detailHint; phoneSuffix; selected }` and `AddressSelection { receiverId; storeId; placeId; version }`.
- CLI operations are allowlisted argv arrays with `shell:false`; sensitive provider fields are transformed server-side before returning.

- [ ] Write failing tests for receiver-list parsing, address redaction, cookie/account isolation, explicit selection, store/place binding, and undeliverable address.
- [ ] Run `npx vitest run server/pupu/commerce-cli.test.ts server/pupu/address-controller.test.ts`; expect missing module failures.
- [ ] Implement safe `GET /api/pupu/addresses` and `POST /api/pupu/addresses/select`, Origin checks, no-store responses, and session-bound persisted opaque selection.
- [ ] Prove serialized responses contain no full phone, encrypted coordinate, receiver payload, auth path, or account path.
- [ ] Run focused tests/lint and commit `feat: select saved pupu delivery addresses`.

### Task 3: Address-Gated Complex Planning

**Files:**
- Modify: `src/journey/types.ts`
- Modify: `src/journey/presentation.ts`
- Modify: `src/journey/useLiveJourney.ts`
- Create: `src/pupu/PupuAddressCard.tsx`
- Create: `src/pupu/PupuAddressCard.test.tsx`
- Modify: `src/App.tsx`
- Modify: `server/chat-handler.ts`
- Modify: `server/index.ts`

**Interfaces:**
- Produces presentation `pupu.address-select` before any store-bound Pupu task and resumes the held demand once after selection.
- Chat scope includes only trusted store/place binding injected server-side; address text never enters the model prompt.

- [ ] Write reducer/component tests for address-required, selection, waiting, resume-once, refresh, and error retention.
- [ ] Write chat tests proving a complex Pupu demand without selection never starts Hermes and a selected address issues a correctly bound scope ticket.
- [ ] Implement the address presentation and resume token using existing `awaiting_input` state and normal layout/reduced-motion rules.
- [ ] Add a complex-demand prompt contract requiring three dishes, simple steps, nutritional coverage, real SKUs/prices/availability, substitutions, and deduplicated ingredients.
- [ ] Run Vitest/lint/browser contracts and commit `feat: gate pupu plans on delivery address`.

### Task 4: Run Artifact Correlation for Multiple Tools

**Files:**
- Modify: `server/tool-artifact.ts`
- Modify: `server/tool-artifact.test.ts`
- Modify: `hermes/plugins/pupu_readonly/provider.py`
- Modify: `hermes/plugins/pupu_readonly/tests/test_provider.py`
- Modify: `server/hermes-client.ts`

**Interfaces:**
- Produces unique artifact envelopes with task ID, tool name, provider request ID, sequence/artifact ID, and validated payload.
- Consumer accepts only the expected task/tool identity and never treats missing/malformed artifacts as success.

- [ ] Add failing tests for parallel search/auth calls, repeated catalog searches, stale artifacts, mismatched tool names, and independent consumption.
- [ ] Implement unique atomic artifact writes and identity-aware reads without a single `sessionId.json` overwrite point.
- [ ] Run Python/Vitest suites and commit `fix: correlate parallel pupu tool artifacts`.

### Task 5: Explicit Cart Preview and Idempotent Write

**Files:**
- Create: `server/pupu/cart-controller.ts`
- Create: `server/pupu/cart-controller.test.ts`
- Create: `server/pupu/commerce-router.ts`
- Modify: `server/pupu/commerce-types.ts`
- Modify: `server/pupu/commerce-cli.ts`
- Create: `src/pupu/PupuCartConfirmCard.tsx`
- Create: `src/pupu/PupuCartConfirmCard.test.tsx`
- Modify: `src/journey/types.ts`
- Modify: `src/journey/presentation.ts`
- Modify: `server/index.ts`

**Interfaces:**
- `POST /api/pupu/cart/preview` accepts provider product IDs and quantities from a signed current plan version.
- `POST /api/pupu/cart/commit` accepts `{ previewId, version, idempotencyKey }`, performs one guarded write, then reads the real cart.

- [ ] Write failing tests for explicit confirmation, plan/account/address binding, duplicate-click idempotency, partial success, quantity adjustment, and readback.
- [ ] Implement deterministic cart preview/commit outside Hermes; never expose generic cart mutation tools to DeepSeek.
- [ ] Render editable quantities and exact mutation consequences with “确认加入购物车”; preserve original cart items.
- [ ] Run focused/full tests and commit `feat: add guarded pupu cart writes`.

### Task 6: Live Settlement Preview and Material-Change Gate

**Files:**
- Create: `server/pupu/checkout-controller.ts`
- Create: `server/pupu/checkout-controller.test.ts`
- Modify: `server/pupu/commerce-router.ts`
- Create: `src/pupu/PupuCheckoutPreviewCard.tsx`
- Create: `src/pupu/PupuCheckoutPreviewCard.test.tsx`
- Modify: `src/journey/types.ts`
- Modify: `src/journey/presentation.ts`

**Interfaces:**
- `POST /api/pupu/checkout/preview` returns a redacted `CheckoutPreviewPresentation` containing address hint, line changes, discounts, delivery fee, payable amount, arrival hint, expiry, preview ID, and version.
- Confirm action is invalid after expiry or any material cart/price/promotion/fee/fulfillment change.

- [ ] Write failing tests for correct summary mapping, address redaction, expiry, material revalidation, and preserved user context on change.
- [ ] Implement CLI `checkout preview` integration and typed error mapping.
- [ ] Render “确认并创建待付款订单” with a prominent real-order consequence statement.
- [ ] Run tests/lint/browser contract and commit `feat: preview real pupu checkout`.

### Task 7: Official Invite-Pay Creation and Safe Link

**Files:**
- Create: `server/pupu/payment-link.ts`
- Create: `server/pupu/payment-link.test.ts`
- Modify: `server/pupu/checkout-controller.ts`
- Modify: `server/pupu/checkout-controller.test.ts`
- Modify: `server/pupu/commerce-router.ts`
- Create: `src/pupu/PupuPaymentCard.tsx`
- Create: `src/pupu/PupuPaymentCard.test.tsx`
- Modify: `src/journey/types.ts`
- Modify: `src/journey/presentation.ts`

**Interfaces:**
- `POST /api/pupu/checkout/create-invite-pay` consumes an exact confirmation and server-held REAL_ORDER approval; it returns only a validated payment presentation.
- `validateOfficialPaymentTarget(value, invitePayId)` allows official HTTPS hosts, supported mini-program targets, or the allowlisted `pupumall` invite-pay scheme bound to the returned ID.

- [ ] Write failing tests for approval binding/one-time use, duplicate request idempotency, outcome-unknown reconciliation, malicious URL rejection, missing URL, link expiry, and order/invite ID binding.
- [ ] Implement CLI approval issuance and `checkout create-from-preview`; keep approval tokens and order bodies server-side.
- [ ] Render amount, expiry, `WAITING_PAY`, and a user-initiated “去朴朴官方付款” anchor with safe external-navigation attributes.
- [ ] Implement a click receipt that records only that navigation was attempted; never mark payment successful from a click.
- [ ] Run tests/lint/browser contracts and commit `feat: create official pupu invite-pay links`.

### Task 8: Payment Status and Specific Recovery UX

**Files:**
- Modify: `server/pupu/checkout-controller.ts`
- Modify: `server/pupu/commerce-router.ts`
- Modify: `src/pupu/PupuPaymentCard.tsx`
- Create: `src/pupu/commerce-errors.ts`
- Create: `src/pupu/commerce-errors.test.ts`
- Modify: `src/journey/presentation.ts`

**Interfaces:**
- `GET /api/pupu/checkout/:checkoutId/status` maps only official states `WAITING_PAY`, `PAY_SUCCESS`, `PAID_BY_OTHER`, `CANCELED`, expired, or unknown.

- [ ] Write failing tests for bounded polling, page-hidden cancellation, terminal states, transient query errors, and distinct recovery copy for auth/address/stock/scope/provider/outcome/link/model failures.
- [ ] Implement visible bounded status refresh and preserve prior successful steps.
- [ ] Remove generic “服务暂时没有回应” where a typed cause exists.
- [ ] Run tests/lint/browser contracts and commit `fix: clarify pupu commerce recovery states`.

### Task 9: Deployment, Three Live Runs, and Global User Test

**Files:**
- Modify: `deploy/hermes/install-plugin.sh`
- Modify: `tests/live/pupu-live.spec.ts`
- Create: `tests/live/pupu-complex-checkout.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Live test is manually gated and never counts an error/demo presentation as success.

- [ ] Run the complete Vitest, Python plugin, lint, build, and browser suites on VPS; all must pass.
- [ ] Install the exact plugin files, restart Hermes/Web, verify health, and prove saved login remains `ready`.
- [ ] Execute the complex low-fat three-dish demand twice read-only and assert live SKUs, prices, three dishes, nutrition, and no mutations.
- [ ] Restart services, execute the third run, select the existing address, confirm real cart write, inspect settlement, obtain user confirmation, create a pending-payment order, and click the official payment target without paying.
- [ ] Verify the opened official surface corresponds to the current order/invite-pay and query `WAITING_PAY`.
- [ ] Perform the first-user global UX pass on mobile viewport, fixing blocker/high issues in login, address, planning, editing, cart, checkout, payment, retry, refresh, back, keyboard, focus, scroll, touch, and reduced motion.
- [ ] Re-run all automated suites plus the relevant live recovery checks; document implemented/tested/external boundaries in Chinese.
