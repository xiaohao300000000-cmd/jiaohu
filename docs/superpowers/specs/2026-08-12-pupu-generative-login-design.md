# Pupu Generative Login Design

**Date:** 2026-08-12
**Status:** Approved for implementation

## Goal

Add the real Pupu login lifecycle to LiquidJourney so that a user who submits
their first Pupu task is guided through phone input, GeeTest slider verification,
and SMS verification inside the existing generative interaction. After login,
the original task resumes automatically and can render only real provider data.

This design supports multiple concurrent users. Each browser session receives an
isolated Pupu account scope and cannot read or replace another user's login state.

## Non-goals

- Do not expose login mutation tools to Hermes or DeepSeek.
- Do not place phone numbers, captcha callback values, SMS codes, Pupu tokens,
  signatures, or cookies in AI messages, tool traces, URLs, application logs, or
  repository files.
- Do not add cart mutation, checkout, ordering, payment, or simulated provider
  success.
- Do not show login when the user opens the home page or submits a non-Pupu task.
- Do not persist a phone number after the active login attempt ends.

## Confirmed product decisions

1. Login appears inside the current Journey rather than on a separate page.
2. Every user enters their own phone number; no previous number is prefilled.
3. Multiple users can log in concurrently without sharing auth directories.
4. A successful login survives a browser restart until Pupu expires it or the
   user explicitly logs out.
5. Login starts before the first Pupu provider task, not after a failed Hermes
   tool call.
6. The interaction uses the existing generative motion and state language.

## Architecture

### 1. Deterministic Pupu intent gate

The client marks known Pupu examples with `capability: "pupu"`. Free-text input
uses the existing deterministic local presentation resolver for explicit Pupu
intent. The gate does not ask a language model whether login is required.

Before sending a gated task to `/api/chat`, the application calls the Pupu login
status controller. If the current browser session is authenticated, the normal
Hermes flow begins immediately. If it is not authenticated, the original task is
held in the Journey snapshot and the inline login presentation begins.

An auth failure returned during a later provider run enters the same login flow.
It never becomes `ready`, and it never produces a fallback product card.

### 2. Login controller outside the AI boundary

A dedicated Express controller owns login mutations and invokes the external
Pupu CLI with `shell: false`. Hermes keeps its read-only Pupu toolset. DeepSeek
receives neither the login form values nor the login controller responses.

The controller is responsible for:

- anonymous browser-session creation;
- per-session Pupu account scope allocation;
- login attempt expiry and resend cooldowns;
- CLI `login status`, `request-code`, `apply-captcha`, and `verify-code` calls;
- GeeTest helper lifecycle and same-origin proxying;
- emitting safe typed login transitions to the Journey reducer;
- resuming the held task once after verified success.

### 3. Session and account isolation

The browser stores only an opaque, persistent, HttpOnly session cookie. In
production it is also `Secure` and `SameSite=Lax`. State-changing endpoints
validate the request Origin and use JSON-only bodies.

The server maps the opaque browser session to a generated safe `account_id`.
Each account receives an independent CLI accounts directory beneath a
mode-0700 VPS root. Pupu auth files remain mode 0600. The mapping stores no phone
number.

The phone number exists only in the active controller process while the login
attempt needs to repeat `request-code` after captcha completion. A server restart
during that short window invalidates the attempt and asks the user to re-enter
the phone number. Saved Pupu auth remains intact.

Session identity is never accepted directly from a client-provided path or CLI
argument. The server resolves every path from its own cookie-to-account mapping.

### 4. Server-issued Pupu scope ticket

The later Hermes catalog call must use the authenticated browser account without
allowing the language model to select an account path or identifier. Immediately
before creating a Hermes run, the chat server atomically writes a short-lived,
mode-0600 scope ticket beneath a mode-0700 runtime directory.

The ticket is keyed by the server-generated Journey session/run correlation and
contains only server-resolved opaque scope identifiers, the allowlisted accounts
root, and an expiry. It contains no phone number or provider credential. The chat
server never accepts these fields from the request body.

The Pupu plugin receives the trusted task/session correlation from Hermes tool
context, resolves the exact ticket, validates expiry and identity, and constructs
CLI arguments with the ticket's account scope. It ignores any model-supplied
account, household, data-root, or accounts-root argument. Missing, expired,
mismatched, malformed, and replayed tickets fail closed before the CLI starts.

The ticket is consumed after the final Pupu tool result or removed when the run
ends, is cancelled, or expires. This keeps saved authentication multi-user while
preserving the existing run/tool artifact correlation boundary.

### 5. Same-origin captcha bridge

The CLI starts its GeeTest helper on a random loopback port with a one-time
challenge token. The controller records the token-to-port mapping inside the
active login attempt and exposes it through a same-origin authenticated proxy.

The Journey login card embeds that proxy in an iframe. Both the challenge GET
and callback POST are forwarded only for the current browser session and active
token. The bridge rejects expired, mismatched, reused, and cross-session tokens.

After a valid callback is stored, the controller runs `apply-captcha`, repeats
`request-code` in the same CLI login session, and advances only when the real CLI
returns `sms_requested`. It then terminates the exact helper and removes the
temporary challenge mapping.

## Journey state and presentation model

The top-level `JourneyState` union remains unchanged. Login uses the existing
`awaiting_input` state so transport status does not become a second UI truth.

Add a presentation registry member with component `pupu.login` and these phases:

- `phone`: explains why Pupu login is needed and accepts a new phone number;
- `requesting`: shows a trace while the real SMS request is attempted;
- `captcha`: expands the same card to the same-origin GeeTest iframe;
- `applying_captcha`: shows a trace while the callback is applied;
- `sms`: accepts the received SMS code and exposes resend cooldown state;
- `verifying`: shows a trace while the code is passed through stdin;
- `connected`: confirms the real authenticated state before task resumption;
- `error`: presents a safe, recoverable error without raw provider details.

The visual sequence is:

```text
Pupu task submitted
  -> receiving
  -> awaiting_input / phone
  -> reasoning / requesting
  -> awaiting_input / captcha (when required)
  -> reasoning / applying_captcha
  -> awaiting_input / sms
  -> reasoning / verifying
  -> connected
  -> reasoning / resume original task once
  -> assembling
  -> ready or error
```

The submitted sentence remains attached to the same Journey origin surface.
Cards use normal flex/grid layout, namespaced layout IDs, `MotionConfig`
reduced-motion behavior, and the existing Obsidian Glass materials. No card body
uses absolute positioning.

The scope ticket is backend-only. It is not a Journey presentation field, AI SDK
data part, DOM attribute, trace entry, or browser-visible identifier.

## API contracts

All responses are typed, safe transition envelopes. They contain a phase,
expiry/cooldown metadata, and an opaque reference when needed. They never return
provider credentials or the submitted phone/code.

### `GET /api/pupu/login/status`

Returns `ready` or `auth_required` for the cookie-bound account scope.

### `POST /api/pupu/login/start`

Accepts `{ phone }`. Creates an expiring login attempt and invokes the real CLI.
Returns `captcha` or `sms`. The request body is excluded from request logging.

### `GET|POST /api/pupu/login/captcha/:attemptId/*`

Proxies the current attempt's loopback helper. Requires the matching browser
session and refuses navigation outside the helper's challenge routes.

### `POST /api/pupu/login/captcha/:attemptId/complete`

Confirms that a callback exists, applies it, and repeats the SMS request in the
same CLI login session. Returns `sms` only after real `sms_requested` evidence.

### `POST /api/pupu/login/verify`

Accepts `{ code }`. The controller supplies the code to CLI `--code-stdin` and
uses `--allow-session-rotation`. Success requires a fresh status read proving
`ready`, `auth_present=true`, `auth_saved=true`, and a zero verify error code.

### `POST /api/pupu/login/resend`

Reuses the active account/login scope after a server-enforced cooldown. It does
not create parallel attempts.

### `DELETE /api/pupu/login/session`

Logs out only the current cookie-bound account and removes that account's saved
Pupu auth after an explicit confirmation. It does not affect other users.

## Original-task resumption

The Journey snapshot holds the original task text and a generated resume token.
Login success dispatches one typed `login.connected` transition. The client then
sends the held task through the existing AI SDK transport with a new request ID
and consumes the resume token atomically.

Refreshing or replaying a completed login response cannot execute the task a
second time. Cancelling login transitions the held task to `interrupted` and
does not call Hermes.

## Error handling

- `captcha_required`: show the inline slider; do not label the task failed.
- expired captcha/attempt: remove only that helper and return to phone input.
- stale GeeTest one-time fields: clear only the documented fields and result file
  for the current account, then create a fresh attempt.
- invalid SMS code: remain on the SMS card, keep the client-side input available
  for correction, and never store or echo it from the server.
- resend throttled: show the remaining cooldown and do not invoke the CLI.
- provider/auth failure: enter Journey `error`; never create a ready card.
- browser disconnect: stop only the active controller operation and exact helper.
- server restart during login: invalidate the transient attempt; retained auth is
  checked again before asking the user to restart login.

## Provider timeout correction

Live evidence showed the direct authenticated catalog command succeeding in
approximately 30.69 seconds while the Hermes plugin terminates it at a hard
30-second deadline. Replace the literal with validated environment configuration
`PUPU_TOOL_TIMEOUT_SECONDS`, defaulting to 75 seconds and constrained to 10-180
seconds.

The timeout remains a typed retryable error. Extending it must not convert a
timeout into success. Journey continues to display live reasoning/trace state
while it waits.

## Security and privacy requirements

- Redact phone, OTP, captcha callback fields, tokens, cookies, sign, and seal at
  every logging and error boundary.
- Never put secret values in process arguments when stdin is supported. The
  phone must be passed to the external CLI only for its required `--phone`
  interface and must not be logged.
- Use constant allowlisted CLI operations and `shell: false`.
- Apply per-session start, captcha, verify, and resend rate limits.
- Set no-store headers on every login response and captcha proxy response.
- Prevent iframe embedding outside the application with CSP/frame-ancestor
  policy while allowing the required GeeTest resources.
- Delete exact expired helper processes and transient challenge artifacts; never
  perform broad process or directory cleanup.
- Keep commerce mutation tools disabled throughout this feature.

## Testing and acceptance

### Automated contracts

- reducer tests for every login phase, cancellation, expiry, and one-time resume;
- controller tests for account isolation, Origin checks, rate limits, redaction,
  helper cleanup, stdin OTP, and safe CLI argv construction;
- scope-ticket tests for mismatch, expiry, replay, malformed data, atomic
  consumption, and cleanup after completion/cancellation;
- concurrent-session tests proving two users cannot read or mutate each other's
  attempts or auth paths;
- adapter tests proving provider/auth errors remain terminal;
- timeout tests proving the validated configuration is passed to the runner;
- browser contract tests for phone, captcha, SMS, reduced motion, retry, and
  cancellation without inventing successful business products.

### Real live acceptance

The live suite is separate and manually gated because it sends a real SMS and
opens a real GeeTest challenge. A passing run must prove:

1. a first Pupu task enters phone login before Hermes execution;
2. the real slider callback advances to `sms_requested`;
3. the real SMS code produces saved authenticated state;
4. the held task resumes exactly once;
5. Hermes invokes the real read-only Pupu catalog tool;
6. the final card has `data-source="live"`, a nonempty run ID, and at least one
   provider product;
7. no demo label, fake product, mutation button, secret, or false ready state is
   present;
8. a second cookie-bound user remains isolated;
9. a later authenticated Pupu task skips login;
10. logout affects only the current user;
11. a forged or replayed account scope cannot start the Pupu CLI and cannot read
    another user's provider data.

## Rollout boundary

The first release exposes login only for Pupu tasks and preserves the existing
read-only provider surface. Production deployment requires HTTPS before enabling
persistent cookies for external users. Login completion and catalog success are
reported separately so one cannot be used as evidence for the other.
