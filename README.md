# LiquidJourney + Hermes + Pupu

LiquidJourney is a React/Vercel AI SDK interface with one server-owned task and capability routing center. Every user message first enters `/api/chat`; the browser, Hermes, and commerce routes consume the same versioned `TaskSnapshot` instead of independently guessing intent.

## Runtime shape

- React 19 and Vercel AI SDK render one composer and one streaming Journey.
- `TaskCoordinator` resolves the task domain, goal, phase, context, requested capabilities, allowed capabilities, and next actions once.
- Express owns browser sessions, Pupu login/address readiness, task policy, commerce phase gates, and Hermes scope tickets.
- Hermes receives a deterministic contract built only from `TaskSnapshot.allowedCapabilities`.
- The external Pupu CLI remains the provider boundary.
- The generic task contract already reserves delivery, Home Assistant, and calendar capabilities so future providers do not need their own intent classifiers.

## Task and capability flow

```text
user message
  -> POST /api/chat
  -> TaskCoordinator resolve or resume
  -> task.updated
  -> readiness and capability policy
      -> ordinary advice: Hermes without provider scope
      -> awaiting_login: existing login Journey, no Hermes
      -> awaiting_address: existing address Journey, no Hermes
      -> allowed read capability: one task-bound scope ticket, then Hermes
  -> provider result attaches selected products to the same task
```

The task context preserves people count, budget, dietary requirements, accumulated requirements, product quantities, selected live products, address binding, and cart/checkout preview bindings. Continuations send `taskId`; login/address completion sends `taskId` with `resume: true`.

## Commerce safety matrix

| Phase | Server capability | Real effect |
| --- | --- | --- |
| `advising` | advice only | none |
| `searching_catalog` | catalog or cart read | read only |
| `editing_plan` | revise/search | none |
| `awaiting_cart_confirmation` | bind cart preview | none |
| `writing_cart` | cart write | only after matching task/version/preview and explicit UI action |
| `awaiting_order_confirmation` | bind checkout preview | read-only settlement preview |
| `creating_order` | create order | only after matching task/version/preview and explicit UI action |
| `awaiting_payment` | payment status/navigation | no automatic payment |

Natural-language confirmation never authorizes a mutation. Commerce routes reject missing, stale, or illegal task state before invoking cart or checkout controllers. Scope tickets bind the browser run to `taskId`, `taskVersion`, and exact read capabilities; the Hermes plugin rejects an operation not present in the ticket before starting the CLI.

## Login and address flow

All inputs first call `POST /api/chat`. If the task requires Pupu and the cookie-bound session or selected address is missing, the server emits `task.updated` plus the existing login/address presentation and stops before Hermes. Phone and OTP values use only dedicated login routes and are never included in AI messages.

Login routes:

- `GET /api/pupu/login/status`
- `POST /api/pupu/login/start`
- `GET /api/pupu/login/captcha/:attemptId/`
- `POST /api/pupu/login/captcha/:attemptId/result`
- `POST /api/pupu/login/captcha/complete`
- `POST /api/pupu/login/verify`
- `POST /api/pupu/login/resend`
- `POST /api/pupu/login/cancel`
- `DELETE /api/pupu/login/session`

## VPS environment

Populate secrets only in the VPS service environment. Never commit a populated env file.

```dotenv
DEEPSEEK_API_KEY=
API_SERVER_KEY=
HERMES_BASE_URL=http://127.0.0.1:8642
APP_PUBLIC_ORIGIN=https://your-host.example
PUPU_CLI_PATH=/home/pupu/providers/pupu-cli/.venv/bin/pupu
PUPU_DATA_DIR=/home/pupu/providers/pupu-cli/.local/private
PUPU_ACCOUNTS_ROOT=/home/pupu/.local/share/jiaohu/pupu-accounts
PUPU_LOGIN_RUNTIME_ROOT=/home/pupu/.local/state/jiaohu/pupu-login
PUPU_SCOPE_TICKET_DIR=/home/pupu/.local/state/jiaohu/pupu-login/scope-tickets
PUPU_RESULT_DIR=/home/pupu/.hermes/run-artifacts
PUPU_TOOL_TIMEOUT_SECONDS=150
```

`PUPU_TOOL_TIMEOUT_SECONDS` accepts integers from 10 through 180. Install the read-only plugin and safe directories with `bash deploy/hermes/install-plugin.sh`.

## Verification

```bash
npm run lint
npx vitest run --maxWorkers=1
/home/pupu/providers/pupu-cli/.venv/bin/python -m pytest -q hermes/plugins/pupu_readonly/tests
npm run build
npm run test:browser
```

Browser and unit contracts use stubs and do not perform a real provider mutation. Do not run `test:live` or real cart/order acceptance without separate explicit authorization.
