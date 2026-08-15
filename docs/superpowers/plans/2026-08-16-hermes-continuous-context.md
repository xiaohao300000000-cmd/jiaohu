# Hermes Continuous Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect follow-up turns to one real Hermes session and expose Hermes native Memory, User, Skills, and session search beside the complete Pupu CLI.

**Architecture:** Keep the rich `/v1/runs` tool-event path. Before creating each run, read the transcript from Hermes' session API and send it back as `conversation_history`; pass a longer-lived `X-Hermes-Session-Key` independently. Include the requested native Hermes toolsets in deployment config.

**Tech Stack:** React 19, AI SDK 7, TypeScript, Express, Hermes Agent HTTP API, Vitest.

## Global Constraints

- Work only in the VPS worktree.
- Preserve the existing generative UI cards.
- Add no application-side routing, memory implementation, skill routing, coordinator, or alternate runtime.
- Do not deploy, push, merge, or execute payment.

---

### Task 1: Session identity and native transcript continuity

**Files:**
- Modify: `src/ai/useLiveJourney.ts`
- Modify: `server/chat-handler.ts`
- Modify: `server/hermes-client.ts`
- Test: `src/App.test.tsx`
- Test: `server/chat-handler.test.ts`
- Test: `server/hermes-client.test.ts`

**Interfaces:**
- Frontend sends `{ requestId, sessionId, sessionKey }` with every turn.
- `createHermesRun(input, sessionId, sessionKey, config, fetch, signal)` reads Hermes history and creates a run.

- [ ] Add failing tests proving follow-ups reuse `sessionId`, reset rotates it, and `sessionKey` remains stable.
- [ ] Add failing server tests proving `sessionId` and `sessionKey` are distinct arguments.
- [ ] Add failing Hermes client tests proving native session history and `X-Hermes-Session-Key` are forwarded.
- [ ] Run the three test files and confirm failures describe the missing behavior.
- [ ] Implement only the identity, history, and header wiring needed for the tests.
- [ ] Rerun the tests and confirm they pass.

### Task 2: Native Hermes capability exposure

**Files:**
- Modify: `deploy/hermes/config.example.yaml`
- Test: `deploy/hermes/deploy-contract.test.ts`


**Interfaces:**
- API Server toolsets include `pupu_cli`, `memory`, `skills`, and `session_search`.

- [ ] Add a failing deployment-contract assertion for all four toolsets and enabled built-in Memory/User flags.
- [ ] Run the contract test and confirm it fails.
- [ ] Update the example config without adding routing or a replacement runtime.
- [ ] Rerun the contract test and confirm it passes.

### Task 3: Full verification

- [ ] Run all Vitest tests.
- [ ] Run Python Pupu CLI plugin tests.
- [ ] Run TypeScript lint and the production build.
- [ ] Run `git diff --check` and inspect the complete diff.
- [ ] Commit the verified branch without pushing or deploying.
