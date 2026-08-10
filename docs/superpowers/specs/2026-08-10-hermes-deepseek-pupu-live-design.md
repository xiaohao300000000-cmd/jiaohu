# Hermes + DeepSeek + Pupu Live Journey Design

## Goal

Connect the existing `LiquidJourney` interface to a real Hermes Agent running on the Pupu VPS. Hermes uses the official DeepSeek API with `deepseek-v4-flash` and invokes a migrated Pupu CLI for real read-only catalog operations. The first version must not generate fake products, substitute mock tool results, or perform real cart/order/payment mutations.

## Confirmed Runtime Boundary

- All repository clones, branches, dependencies, source edits, tests, logs, and generated artifacts live on `pupu-vps`.
- The implementation worktree is `/home/pupu/.worktrees/jiaohu-hermes-pupu-live` on `codex/hermes-pupu-live`.
- The existing checkout at `/home/pupu/vercel ai sdk` remains untouched.
- The Mac is only a read source for migrating the external Pupu CLI. No project checkout, temporary implementation file, or generated artifact is written to the Mac.
- DeepSeek credentials are supplied only after the key-independent framework is complete. No API key is committed, printed, copied into browser-visible variables, or requested in chat.

## Architecture

```text
React 19 + LiquidJourney
        |
        | AI SDK UI message stream
        v
VPS Node chat adapter
        |
        | loopback authenticated Hermes Runs/Responses stream
        v
Hermes Agent (the only agent loop)
        |
        +--> DeepSeek API / deepseek-v4-flash
        |
        +--> pupu-readonly Hermes plugin
                  |
                  v
             external Pupu CLI
```

Hermes is the sole owner of model reasoning, tool selection, tool execution, multi-step continuation, interruption, and approval state. Vercel AI SDK is a transport and UI-state layer only. It must not register a second copy of the Pupu tools or run an independent agent loop.

## Existing UI Preservation

The implementation preserves the current Vite application and its established component boundaries:

- `JourneyOriginSurface` remains the continuous source-anchored task object.
- `journeyReducer` remains the authoritative UI state machine.
- `LiquidJourney` continues to render receiving, reasoning, assembling, ready, awaiting-input, interrupted, and error states.
- `PupuPurchaseCard` and `PupuCartCard` keep their current presentation and safety wording.
- Existing layout IDs, neutral dark glass design, reduced-motion behavior, and visual regression coverage remain intact.
- No Next.js, Tailwind, neon palette, or replacement single-file journey component is introduced.

`useJourneyDemo` may remain for existing visual regression coverage, but it is not extended and is never used as a production fallback. Production requests fail visibly when Hermes, DeepSeek, or the Pupu provider is unavailable.

## Hermes Deployment

Hermes is installed and configured on the VPS with:

```yaml
model:
  provider: deepseek
  default: deepseek-v4-flash
  base_url: https://api.deepseek.com
```

`DEEPSEEK_API_KEY` is stored in the VPS-private Hermes environment only. Hermes Gateway binds to `127.0.0.1`; it is not exposed directly to the public network. A generated API server key protects loopback calls from the Node adapter. The web application never receives either secret.

The public UI uses only a restricted Hermes toolset containing the Pupu read-only plugin. General terminal, filesystem mutation, code execution, browser, delegation, messaging, and scheduling tools are excluded from this surface.

## Pupu CLI Migration and Provider Contract

The existing Pupu CLI remains an external provider boundary. The integration does not copy its protocol, signing, authentication, or business logic into `jiaohu` or Hermes core.

Migration copies the CLI source and required runtime/account state to a private VPS provider directory, then creates a Linux-compatible runtime. A macOS binary is never assumed to execute on Linux. Secrets and account state retain owner-only permissions.

The provider exposes these first-version read-only capabilities when the CLI reports that they are available:

```text
pupu_capabilities
pupu_auth_status
pupu_search_catalog
pupu_get_product
pupu_read_cart
```

Every invocation:

1. uses an argv array without a shell;
2. has a bounded timeout and output-size limit;
3. parses stdout as JSON;
4. validates the result against an explicit schema;
5. removes phone, token, signature, cookie, and raw provider-debug material;
6. returns either validated live data or a typed error;
7. never substitutes sample products after an error.

No CLI mutation command is registered in Hermes for this version. Cart writes, ordering, payment, login initiation, SMS verification, and account mutation remain outside the toolset.

## Hermes Plugin

Pupu is added through a Hermes plugin rather than a Hermes core modification. The plugin owns only JSON schemas and dispatch into the external provider adapter. Handlers return JSON strings as required by Hermes.

Tool descriptions explicitly state that returned products, prices, inventory, and cart state come from the live CLI. The model must not invent missing fields. Provider errors are returned as structured errors and terminate or clarify the run instead of silently fabricating a result.

## UI Stream Contract

The Node adapter converts Hermes lifecycle events into type-safe AI SDK UI data parts and then into the existing `JourneyEvent` union:

```text
run.started              -> request.sent / receiving
model.started            -> stream.started / reasoning
tool.started             -> trace.updated / reasoning
tool.completed           -> result.partial / assembling
approval.required        -> approval.requested / awaiting_input
text.delta               -> partial safe summary
run.completed            -> stream.finished / ready
run.failed               -> stream.failed / error
run.cancelled             -> stream.interrupted / interrupted
```

The UI shows safe execution summaries, tool names, and verifiable provider facts. It does not display hidden chain-of-thought or raw DeepSeek `reasoning_content`.

Each request carries a stable run ID. Stale events are ignored by the existing reducer. Cancellation aborts the browser stream and asks Hermes to stop the corresponding run.

## Error Handling

Errors are classified into:

- `offline`: the Node adapter cannot reach loopback Hermes;
- `timeout`: Hermes or the CLI exceeds its configured deadline;
- `provider`: DeepSeek or the Pupu CLI returns a valid provider failure;
- `invalid_result`: CLI JSON or final business data fails schema validation;
- `unknown`: an unexpected internal failure after secrets are redacted.

User-visible errors contain a safe message and opaque reference ID. Server logs contain enough structured context to diagnose the boundary but never include API keys, auth tokens, full phone numbers, signatures, cookies, or raw account state.

## Testing Strategy

Implementation follows strict RED-GREEN-REFACTOR TDD.

Automated tests use real parser, validation, state mapping, HTTP stream, and process-boundary code. Tests may inject a deterministic process runner to prove timeouts, malformed JSON, redaction, and exit-code handling; they do not create fake business products or count mock-only success as live integration.

The final live acceptance sequence is:

1. Hermes and CLI readiness checks pass on the VPS.
2. The migrated CLI reports real capabilities and valid auth state.
3. A real read-only catalog query returns schema-valid live data.
4. Hermes calls the Pupu plugin for a natural-language purchase request.
5. The browser renders receiving, reasoning, assembling, and ready from the real stream.
6. Product evidence is marked `dataSource: live`.
7. Provider failure produces the real error UI with no sample fallback.
8. Unit tests, type checking, Vite build, and Playwright regression tests pass.

Steps 4-5 requiring DeepSeek run only after the user installs the dedicated test API key. Until then, completion is reported as key-independent framework completion, not full live-model completion.

## Non-Goals

- No mock product/catalog fallback.
- No real cart mutation, checkout, order placement, payment, or account change.
- No public exposure of Hermes Gateway or the Pupu CLI.
- No rewrite to Next.js or Tailwind.
- No change to the approved neutral dark-glass visual system.
- No absorption of the Pupu CLI into the application repository.

## Acceptance Boundary

The framework is ready for the test key when all key-independent automated checks pass and a real CLI read query succeeds on the VPS. The feature is fully live only after a DeepSeek-backed Hermes run drives the browser end to end.
