# LiquidJourney + Hermes + Pupu

LiquidJourney is a React/Vercel AI SDK interface for real, read-only Pupu tasks. The browser streams Hermes run events into deterministic Journey presentations. Product cards are rendered only from validated Pupu CLI artifacts; the application does not synthesize fallback products and exposes no cart or checkout mutation.

## Runtime shape

- React 19 and Vercel AI SDK render the streaming Journey.
- Express owns browser sessions, Pupu login, the same-origin captcha bridge, and Hermes scope tickets.
- Hermes runs on loopback and uses DeepSeek V4 Flash.
- The external Pupu CLI remains the provider boundary.
- Each browser receives an opaque HttpOnly cookie and an isolated account directory.

A Pupu task first calls `GET /api/pupu/login/status`. If authentication is required, the same Journey card moves through phone, captcha, and SMS states. Phone and OTP values use only the dedicated login routes; they are never included in AI messages. On verified success, the held task is consumed and sent to Hermes exactly once.

## Security boundaries

Production must use HTTPS and set `APP_PUBLIC_ORIGIN` to the public HTTPS origin. Mutating login routes require a matching `Origin` and JSON body. Captcha traffic is proxied only from a recorded loopback helper to the current browser session.

Persistent Pupu authentication lives under `PUPU_ACCOUNTS_ROOT`. Login attempts are process-memory state with a short TTL. Cancel removes only the current attempt; `DELETE /api/pupu/login/session` is the explicit scoped logout and removes only the cookie-bound account. Account identifiers and paths are resolved server-side.

The read-only Hermes plugin accepts only a short-lived server-issued scope ticket. Model-supplied account IDs, roots, tickets, phone numbers, codes, cookies, tokens, signatures, and seals are ignored or rejected.

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
PUPU_TOOL_TIMEOUT_SECONDS=75
```

`PUPU_TOOL_TIMEOUT_SECONDS` accepts integers from 10 through 180. Login attempts default to 600 seconds and SMS resend cooldown to 60 seconds; configure them with `PUPU_LOGIN_ATTEMPT_TTL_SECONDS` and `PUPU_LOGIN_RESEND_COOLDOWN_SECONDS`.

Install the read-only plugin and safe directories from the repository:

```bash
bash deploy/hermes/install-plugin.sh
```

Restart only the LiquidJourney and Hermes services after configuration changes. Hermes remains loopback-only; terminate HTTPS at the existing VPS reverse proxy.

## Login routes

- `GET /api/pupu/login/status`
- `POST /api/pupu/login/start`
- `GET /api/pupu/login/captcha/:attemptId/`
- `POST /api/pupu/login/captcha/:attemptId/result`
- `POST /api/pupu/login/captcha/complete`
- `POST /api/pupu/login/verify`
- `POST /api/pupu/login/resend`
- `POST /api/pupu/login/cancel`
- `DELETE /api/pupu/login/session`

All responses are non-cacheable and omit phone, OTP, provider credentials, and raw captcha helper addresses.

## Verification

```bash
npm run lint
npm test -- --run
/home/pupu/providers/pupu-cli/.venv/bin/python -m pytest -q hermes/plugins/pupu_readonly/tests
npm run build
npm run test:browser
```

Browser contract tests stub login transitions and never claim a real provider result. Real acceptance is separately gated:

```bash
PUPU_LIVE=1 npm run test:live
```

A real login run requires an operator to complete the official slider and short-lived SMS code in the browser. A passing real acceptance must show `data-source="live"`, a non-empty run ID, at least one provider product, and no mutation action. Without that operator-backed run, only implementation and contract verification—not live provider success—may be claimed.
