# LiquidJourney + Hermes + Pupu CLI

Hermes is the only agent runtime. The application sends user text to Hermes and
projects Hermes run/tool events and its final result into the frontend.

The Pupu integration is one thin tool:

```
pupu_cli(operation, arguments)
```

It starts the installed external Pupu CLI with the operation and argument tokens
chosen by Hermes, then returns the CLI output unchanged. There is no application
operation list, intent router, phase coordinator, or business workflow between
Hermes and the CLI.

Pupu CLI product results are projected into the existing generative UI
presentation contract and rendered by the original Pupu cards. The cards are a
presentation layer only: they do not decide which CLI operation Hermes may call.
Login, address, cart, checkout, and invite-pay card components remain available
without restoring the removed task coordinator or server capability router.

## Current Pupu CLI surface

Hermes discovers the current surface with `pupu_cli("capabilities", ["--json"])`
and can inspect any command with `--help`. The current CLI reports:

- login status, request-code, apply-captcha, verify-code
- account info and refresh
- catalog search and detail
- cart read, add, and remove
- coupon list and claim
- checkout preview and create-invite-pay
- order detail
- invite-pay detail and share
- approval issue

The CLI remains responsible for its own command inputs and returned results.
Creating invite-pay does not execute payment.

## Verification

```bash
npm test
npm run lint
npm run build
PYTHONPATH=. /home/pupu/providers/pupu-cli/.venv/bin/python \
  -m pytest hermes/plugins/pupu_cli/tests -q
```

The Hermes deployment example is under `deploy/hermes/`.
