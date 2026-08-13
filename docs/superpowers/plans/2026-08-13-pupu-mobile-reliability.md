# Pupu Mobile Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Remove the post-login scope mismatch and false-stuck trace while reducing avoidable latency in real Pupu reads.

**Architecture:** Server-side authenticated address selection is the single source of truth for issuing read-only scope. Hermes is constrained to one relevant Pupu tool path, terminal failures are monotonic, and saved-address reads use a short isolated cache.

**Tech Stack:** React 19, TypeScript, Express, Vercel AI SDK, Hermes Agent, Python Pupu plugin, Vitest.

## Global Constraints

- Write project files only on the VPS.
- Preserve real Pupu CLI execution; do not add mock or demo fallbacks.
- Keep login and address selection before the first Pupu tool call.
- Do not weaken account/address binding or write-operation confirmations.

---

### Task 1: Unify read-scope authorization

**Files:**
- Modify: `server/index.ts`
- Modify: `server/chat-handler.test.ts`
- Test: `server/chat-handler.test.ts`

- [ ] Add a failing test where input is “帮我看看大瓶的牛奶”, the old classifier misses it, but a resolved session with selected binding issues a ticket before Hermes starts.
- [ ] Add a failing test proving no ticket is issued when session or selection is absent.
- [ ] Remove the keyword classifier gate from `preparePupuScope`; resolve cookie, session, and selected binding as the authority.
- [ ] Run the focused tests and commit.

### Task 2: Make terminal failures monotonic

**Files:**
- Modify: `src/ai/hermes-event-adapter.ts`
- Modify: `src/ai/hermes-event-adapter.test.ts`
- Test: `src/ai/hermes-event-adapter.test.ts`

- [ ] Add a failing sequence test: failed Pupu artifact, later capabilities start/complete, run completed.
- [ ] Assert the first failure is retained and all later events map to null.
- [ ] Add the minimal terminal-failure guard.
- [ ] Run focused tests and commit.

### Task 3: Reduce Hermes discovery turns

**Files:**
- Modify: `server/chat-handler.ts`
- Modify: `server/chat-handler.test.ts`

- [ ] Add failing tests for complex meal, cart read, and ordinary catalog search execution contracts.
- [ ] Implement deterministic contracts that forbid capabilities/auth discovery and request exactly one domain tool.
- [ ] Preserve generic non-Pupu prompts unchanged.
- [ ] Run focused tests and commit.

### Task 4: Cache saved addresses safely

**Files:**
- Modify: `server/pupu/address-controller.ts`
- Modify: `server/pupu/address-controller.test.ts`

- [ ] Add failing tests for same-account cache hit, five-minute expiry, and cross-account isolation.
- [ ] Add an injectable clock and five-minute redacted/provider-address cache.
- [ ] Keep explicit selection and full binding validation unchanged.
- [ ] Run focused tests and commit.

### Task 5: Validate real public mobile flow

**Files:**
- Modify only if a reproduced UX defect requires a tested change.

- [ ] Run all related Vitest suites, TypeScript validation, secret scan, and production build.
- [ ] Restart the VPS Web service with the public HTTPS origin.
- [ ] From the public URL, perform one real read-only Pupu search using the existing logged-in mobile session or a new isolated session.
- [ ] Verify the run reaches a live result or explicit terminal error and never remains on an active capabilities trace.
- [ ] Push the branch, merge through PR, and reverse-verify GitHub `main`.

