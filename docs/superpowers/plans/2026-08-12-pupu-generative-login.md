# Pupu Generative Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real multi-user Pupu login before the first Pupu Hermes task, resume that task exactly once, and fix the proven timeout without mock business data.

**Architecture:** Express owns opaque cookie sessions, transient login attempts, the external CLI, and a same-origin captcha bridge. React renders deterministic transitions through the existing Journey reducer. Express issues a short-lived server-only account-scope ticket before Hermes; the read-only plugin consumes it and never trusts model-provided scope.

**Tech Stack:** React 19, TypeScript, Vite, Express 5, Vercel AI SDK, Motion, Vitest, Playwright, Python, Pytest, external Pupu CLI.

## Global Constraints

- Edit only the VPS worktree `/home/pupu/.worktrees/jiaohu-journey-single-truth`.
- Keep commerce mutations disabled and never create fake products or false ready states.
- Never log, persist, echo, or send phone, OTP, captcha callbacks, cookies, credentials, sign, or seal to DeepSeek/Hermes.
- Pass OTP through stdin; use constant CLI argv and `shell: false`.
- Resolve account paths only from the HttpOnly session; ignore client/model scope.
- Keep `JourneyState` unchanged; login uses `awaiting_input`.
- Use strict TDD and commit each completed task.

---

### Task 1: Fix the provider deadline

**Files:** modify `hermes/plugins/pupu_readonly/provider.py`, `hermes/plugins/pupu_readonly/tests/test_provider.py`, and `deploy/hermes/install-plugin.sh`.

- [ ] RED: test default 75, override 120, and invalid 9/181/abc/10.5; run `.venv/bin/pytest -q hermes/plugins/pupu_readonly/tests/test_provider.py`, expecting the current hard 30 to fail.
- [ ] GREEN: implement `provider_timeout_seconds` with inclusive 10-180 validation. Invalid config returns `invalid_configuration`; actual timeout stays retryable.
- [ ] Add `PUPU_TOOL_TIMEOUT_SECONDS=75`, rerun PASS, commit `fix: make pupu provider timeout configurable`.

### Task 2: Add isolated browser account sessions

**Files:** create `server/pupu/session-store.ts`, its test, `http-security.ts`, its test; modify `server/config.ts`.

- [ ] RED: test distinct cookie/account IDs, restart-safe records without phone, 0700/0600 modes, tamper refusal, production cookie flags, Origin, JSON-only mutations, and no-store. Run focused Vitest; expect missing modules.
- [ ] GREEN: add validated CLI/data/accounts/runtime roots, public origin, attempt TTL, and cooldown config. Atomically persist only `{sessionHash,accountId,createdAt}`; cookie contains random `pupu_session`.
- [ ] Add safe server-only paths, rerun PASS, commit `feat: isolate pupu browser account sessions`.

### Task 3: Implement real CLI login

**Files:** create `server/pupu/login-types.ts`, `cli-runner.ts` and test, `login-controller.ts` and test.

- [ ] RED: test safe phases, `shell:false`, allowlisted argv, server scope, phone only in required argv, OTP only on stdin, abort, output limit, redaction, status, captcha, SMS, invalid code, fresh ready proof, cooldown, expiry, cancel, and concurrent isolation.
- [ ] Run focused Vitest; expect missing modules.
- [ ] GREEN: implement `login status`, `request-code --phone`, `apply-captcha`, and `verify-code --code-stdin --allow-session-rotation`, always with server-resolved account/accounts-root/data-root and JSON.
- [ ] Keep phone only in the expiring attempt. Success requires fresh ready status with auth_present, auth_saved, and zero verify error.
- [ ] Rerun PASS, commit `feat: add real pupu login controller`.

### Task 4: Bridge one-time captcha on same origin

**Files:** create `server/pupu/captcha-bridge.ts` and test; modify login controller and test.

- [ ] RED: test session/attempt binding, route allowlist, GET/POST, no-store/CSP, callback, one-time use, cross-session denial, expiry, abort, and exact helper cleanup.
- [ ] GREEN: proxy only the recorded loopback port and never reveal raw port/token.
- [ ] After callback, apply captcha, repeat request-code in the same attempt, require real sms_requested, then stop only that helper.
- [ ] Rerun PASS, commit `feat: bridge pupu captcha through same origin`.

### Task 5: Bind Hermes tools with scope tickets

**Files:** create `server/pupu/scope-ticket.ts` and test; modify chat handler/tests; create Python `scope_ticket.py` and test; modify plugin provider/registration.

- [ ] RED: test 0700 root, atomic 0600 ticket, correlation, expiry, malformed/mismatch/replay, cancel cleanup, and zero CLI starts on failure. Run `npx vitest run server/pupu/scope-ticket.test.ts server/chat-handler.test.ts && .venv/bin/pytest -q hermes/plugins/pupu_readonly/tests/test_scope_ticket.py`.
- [ ] GREEN: ticket fields are only version, sessionId, accountId, accountsRoot, dataRoot, expiresAt, nonce. Write before Hermes, pass trusted correlation, atomically consume in plugin, remove model-controlled scope.
- [ ] Fail closed and clean completion/cancel/expiry; rerun PASS.
- [ ] Commit `feat: bind hermes pupu tools to server account scope`.

### Task 6: Expose protected login routes

**Files:** create `server/pupu/login-router.ts` and test; modify `server/index.ts` and request lifecycle.

- [ ] RED: route-test status/start/captcha/complete/verify/resend/delete, cookie, Origin/JSON, disconnect, rate limits, no-store, safe errors, and isolation.
- [ ] GREEN: mount approved `/api/pupu/login` routes, bind every action to cookie scope, exclude bodies/cookies from logs.
- [ ] Rerun PASS, commit `feat: expose secure pupu login routes`.

### Task 7: Render pupu.login in Journey

**Files:** modify Journey types/reducer/tests/renderer; create `src/components/pupu/PupuLoginJourney.tsx`, test, and CSS.

- [ ] RED: reducer-test every phase, expiry, retry, cancel, connected, consumed resume token; UI-test phone, captcha iframe, SMS, safe error, busy states, reduced motion, labels, no secret reflection, and no absolute card body.
- [ ] GREEN: add `component:"pupu.login"` and typed login events without changing `JourneyState`.
- [ ] Render normal flex/grid Obsidian Glass with namespaced layoutId and `MotionConfig reducedMotion="user"`.
- [ ] Rerun PASS, commit `feat: render pupu login inside liquid journey`.

### Task 8: Preflight and resume exactly once

**Files:** modify home presentation/tests, `useLiveJourney.ts` and tests, App/tests; create `src/ai/pupu-login-client.ts` and test.

- [ ] RED: Pupu preflights before chat, non-Pupu skips, authenticated goes direct, success resumes once, replay does not submit, cancel interrupts, later auth failure re-enters login.
- [ ] GREEN: reuse deterministic capability classification and hold `{text,resumeToken}` in reducer memory only. Keep phone/code out of AI messages.
- [ ] Consume resume token before `sendMessage`; duplicate connected is a no-op.
- [ ] Rerun PASS, commit `feat: preflight pupu auth and resume task once`.

### Task 9: Browser and real acceptance

**Files:** create `tests/contract/pupu-login.contract.spec.ts`; modify Journey contract, `tests/live/pupu-live.spec.ts`, live config.

- [ ] Contract-test phone/captcha/SMS/retry/cancel/reduced-motion/isolation and zero fake products. Transition stubs never claim provider success.
- [ ] Run `npm run test:browser`; expect PASS without real SMS.
- [ ] Extend manually gated live test for real phone/slider/OTP, login-before-Hermes, one resume, real read-only tool, live card/run ID, isolation, skip-login, scoped logout, and forged/replayed ticket refusal.
- [ ] Run `npm run test:live` only with explicit operator participation.
- [ ] Commit `test: cover pupu generative login journey`.

### Task 10: Deploy and prove

**Files:** modify deploy config/install, README, and approved design status.

- [ ] Document HTTPS, modes, timeout, routes, live gate, persistent auth versus ephemeral attempts, and scoped logout without secrets.
- [ ] Install plugin and restart only scoped VPS services.
- [ ] Run `npm run lint`, `npm test -- --run`, `.venv/bin/pytest -q hermes/plugins/pupu_readonly/tests`, `npm run build`, and `npm run test:browser`; expect all PASS.
- [ ] Run real authenticated catalog proof: live source, run ID, provider products, no mutation, no secret leakage.
- [ ] Inspect `git diff --check`, status, commit range. Commit docs, push branch, open PR, and distinguish PR from remote main.

