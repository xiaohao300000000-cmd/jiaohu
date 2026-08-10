# Hermes DeepSeek Pupu Live Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the existing LiquidJourney UI against a VPS-hosted Hermes Agent using `deepseek-v4-flash` and a real read-only Pupu CLI provider, with no fake product fallback.

**Architecture:** Hermes owns the only agent loop and calls a restricted project-owned Pupu plugin. A VPS Node adapter consumes Hermes run events and emits AI SDK UI data parts, while the existing journey reducer remains the authoritative browser state machine.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Vercel AI SDK, Vitest, Playwright, Hermes Agent, Python 3.12, Pydantic, external Pupu CLI.

## Global Constraints

- All writes, dependencies, tests, logs, and artifacts must stay on `pupu-vps`.
- Work only in `/home/pupu/.worktrees/jiaohu-hermes-pupu-live` on `codex/hermes-pupu-live`.
- Preserve the checkout at `/home/pupu/vercel ai sdk`.
- Use `deepseek-v4-flash` with `https://api.deepseek.com`.
- Do not request, print, commit, or expose `DEEPSEEK_API_KEY`; the user supplies it only for final testing.
- Do not add fake products, business mock fallbacks, real cart mutations, orders, payments, or login mutations.
- Hermes is the only agent loop. AI SDK is transport and typed UI state only.
- Keep the Pupu CLI external; do not copy its signing or protocol logic into this repository.
- Keep Hermes bound to loopback and expose only the Pupu read-only toolset.
- Preserve the existing dark-glass UI, layout IDs, accessibility behavior, and demo-only visual regression fixtures.
- Use strict RED-GREEN-REFACTOR TDD for every new behavior.

---

### Task 1: Establish the VPS runtime and prove the clean baseline

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Verify: existing `src/**/*.test.{ts,tsx}`

**Interfaces:**
- Consumes: Ubuntu 22.04 x86_64, Python 3.12.13, the clean worktree.
- Produces: Node 22/npm, JDK 17/Maven, installed JavaScript dependencies, and a recorded green baseline.

- [ ] **Step 1: Install user-scoped Node 22 and build prerequisites on the VPS**

Run:

```bash
export NVM_DIR=/home/pupu/.nvm
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
. "$NVM_DIR/nvm.sh"
nvm install 22
nvm alias default 22
sudo apt-get update
sudo apt-get install -y openjdk-17-jdk-headless maven rsync
node --version
npm --version
javac -version
mvn -version
```

Expected: Node reports `v22.x`, npm is present, `javac` reports 17, and Maven starts.

- [ ] **Step 2: Install the existing lockfile and prove the baseline**

Run:

```bash
cd /home/pupu/.worktrees/jiaohu-hermes-pupu-live
npm ci
npm test
npm run lint
npm run build
```

Expected: existing tests, type checks, and Vite build pass before feature code.

- [ ] **Step 3: Add only the required integration dependencies**

Run:

```bash
npm install ai @ai-sdk/react zod express
npm install --save-dev @types/express @types/node tsx
```

Modify scripts to include:

```json
{
  "dev": "tsx server/index.ts",
  "dev:ui": "vite --host 127.0.0.1",
  "start": "NODE_ENV=production tsx server/index.ts"
}
```

- [ ] **Step 4: Commit the runtime baseline**

```bash
git add package.json package-lock.json
git commit -m "build: add AI SDK server runtime"
```

### Task 2: Migrate and verify the external Pupu CLI on Linux

**Files:**
- External VPS provider: `/home/pupu/providers/pupu-cli`
- External VPS private state: `/home/pupu/providers/pupu-cli/.local/private`
- Test: external CLI test suite

**Interfaces:**
- Consumes: Mac source `/Users/xiaohao30000/.local/share/pupu-cli-macos`.
- Produces: `/home/pupu/providers/pupu-cli/.venv/bin/pupu`, JSON CLI envelopes, and the stable household ID `household-f3f3b74a55ae8bf60b6c1172`.

- [ ] **Step 1: Copy source and private runtime directly from Mac to VPS**

Run on the Mac without creating local artifacts:

```bash
rsync -a   --exclude .venv   --exclude __pycache__   --exclude '*.pyc'   /Users/xiaohao30000/.local/share/pupu-cli-macos/   pupu-vps:/home/pupu/providers/pupu-cli/
ssh pupu-vps 'chmod -R go-rwx /home/pupu/providers/pupu-cli/.local/private'
```

Expected: source and required signer assets exist only on the VPS destination; the macOS virtualenv is not copied.

- [ ] **Step 2: Build a Linux Python runtime**

Run:

```bash
ssh pupu-vps '
  cd /home/pupu/providers/pupu-cli
  python3.12 -m venv .venv
  .venv/bin/pip install --upgrade pip
  .venv/bin/pip install -e ".[dev,reverse]"
  .venv/bin/pytest -q
'
```

Expected: the external CLI test suite passes on Linux.

- [ ] **Step 3: Prove the actual CLI contract without mutation**

Run:

```bash
ssh pupu-vps '
  export PUPU_RUNTIME_ROOT=/home/pupu/providers/pupu-cli
  export PUPU_DATA_DIR=/home/pupu/providers/pupu-cli/.local/private
  /home/pupu/providers/pupu-cli/.venv/bin/pupu capabilities --json
  /home/pupu/providers/pupu-cli/.venv/bin/pupu login status     --household-id household-f3f3b74a55ae8bf60b6c1172 --json
'
```

Expected: both commands return valid `CliEnvelope` JSON. Record `ready` or `auth_required` exactly; do not fabricate readiness.

- [ ] **Step 4: Attempt one real read-only query only when auth is ready**

Run:

```bash
request_id=$(python3.12 -c 'import uuid; print(uuid.uuid4())')
/home/pupu/providers/pupu-cli/.venv/bin/pupu catalog search   --queryr[v   --household-id household-f3f3b74a55ae8bf60b6c1172   --request-id "$request_id"   --data-root /home/pupu/providers/pupu-cli/.local/private   --size 5 --json
```

Expected: schema-valid live data, or a real typed `auth_required`/provider error that becomes an explicit remaining external condition.

### Task 3: Build the restricted Hermes Pupu plugin with TDD

**Files:**
- Create: `hermes/plugins/pupu_readonly/plugin.yaml`
- Create: `hermes/plugins/pupu_readonly/__init__.py`
- Create: `hermes/plugins/pupu_readonly/provider.py`
- Create: `hermes/plugins/pupu_readonly/schemas.py`
- Create: `hermes/plugins/pupu_readonly/tests/test_provider.py`
- Create: `hermes/plugins/pupu_readonly/tests/test_plugin.py`

**Interfaces:**
- Consumes: `PUPU_CLI_PATH`, `PUPU_DATA_DIR`, `PUPU_HOUSEHOLD_ID`, argv arrays.
- Produces: `run_pupu(operation: str, arguments: dict[str, object]) -> str` and five Hermes tools: `pupu_capabilities`, `pupu_auth_status`, `pupu_search_catalog`, `pupu_get_product`, `pupu_read_cart`.

- [ ] **Step 1: Write failing allowlist and envelope tests**

The tests must assert:

```python
def test_rejects_write_operation_before_process_start():
    runner = RecordingRunner()
    result = json.loads(run_pupu("cart.add", {}, runner=runner))
    assert result["ok"] is False
    assert result["error"]["code"] == "operation_not_allowed"
    assert runner.calls == []

def test_accepts_cli_envelope_and_redacts_sensitive_details():
    envelope = {
        "schema_version": "1",
        "ok": False,
        "operation": "pupu.catalog.search",
        "request_id": "req-1",
        "household_id": "household-1",
        "status": "failed",
        "data": None,
        "error": {
            "code": "pupu_transport_error",
            "message": "provider rejected request",
            "retryable": True,
            "details": {"authorization": "secret", "safe_code": "E1"},
        },
        "next_actions": [],
        "evidence_ref": None,
    }
    result = json.loads(parse_cli_output(json.dumps(envelope)))
    assert result["error"]["details"] == {"safe_code": "E1"}
```

- [ ] **Step 2: Run RED**

Run:

```bash
python3.12 -m pytest hermes/plugins/pupu_readonly/tests -q
```

Expected: FAIL because the plugin provider does not exist.

- [ ] **Step 3: Implement the minimal process boundary**

Implement:

```python
READ_ONLY_OPERATIONS = {
    "capabilities",
    "login.status",
    "catalog.search",
    "catalog.detail",
    "cart.read",
}

def run_pupu(
    operation: str,
    arguments: dict[str, object],
    *,
    runner: ProcessRunner = subprocess_runner,
) -> str:
    if operation not in READ_ONLY_OPERATIONS:
        return error_json("operation_not_allowed", "Only read-only Pupu operations are enabled")
    argv = build_argv(operation, arguments)
    completed = runner(argv, timeout=30, max_output_bytes=1_000_000)
    return parse_cli_output(completed.stdout)
```

Use Pydantic models matching `CliEnvelope` and `NormalizedSku`. Never use `shell=True`.

- [ ] **Step 4: Register exactly five tools**

`register(ctx)` must register the five names in the interface block and no mutation tool. Each handler calls `run_pupu` and returns its JSON string.

- [ ] **Step 5: Run GREEN and commit**

```bash
python3.12 -m pytest hermes/plugins/pupu_readonly/tests -q
git add hermes/plugins/pupu_readonly
git commit -m "feat: add read-only Hermes Pupu plugin"
```

### Task 4: Define typed Hermes-to-Journey stream contracts with TDD

**Files:**
- Create: `src/ai/journey-ui-message.ts`
- Create: `src/ai/hermes-event-adapter.ts`
- Create: `src/ai/hermes-event-adapter.test.ts`
- Modify: `src/components/agent/agent-ui-event.ts`

**Interfaces:**
- Consumes: normalized Hermes run events and validated Pupu CLI envelopes.
- Produces: `JourneyDataPart`, `JourneyUIMessage`, `mapHermesEvent(event, context): JourneyEvent | AgentUIEvent<PupuPurchasePayload> | null`.

- [ ] **Step 1: Write failing lifecycle mapping tests**

Assert exact mappings for `run.started`, `tool.started`, `tool.completed`, `run.completed`, `run.failed`, and `run.cancelled`. Also assert that raw `reasoning_content`, tokens, authorization, cookie, sign, and seal fields never enter a data part.

- [ ] **Step 2: Run RED**

```bash
npm test -- src/ai/hermes-event-adapter.test.ts
```

Expected: FAIL because the adapter is missing.

- [ ] **Step 3: Implement Zod schemas and the mapper**

Define:

```ts
export type JourneyDataPart =
  | { type: "journey-event"; data: JourneyEvent }
  | { type: "pupu-event"; data: AgentUIEvent<PupuPurchasePayload> };

export type JourneyUIMessage = UIMessage<
  { runId: string },
  { journey: JourneyEvent; pupu: AgentUIEvent<PupuPurchasePayload> }
>;
```

Convert real CLI SKU fields: `store_product_id -> productId`, `price_cents / 100 -> unitPrice`, `unit -> specification`, and `in_stock -> stockStatus`. Set `dataSource: "live"` only after schema validation.

- [ ] **Step 4: Run GREEN and commit**

```bash
npm test -- src/ai/hermes-event-adapter.test.ts
git add src/ai src/components/agent/agent-ui-event.ts
git commit -m "feat: map Hermes runs to journey events"
```

### Task 5: Add the VPS Hermes stream adapter and AI SDK route with TDD

**Files:**
- Create: `server/config.ts`
- Create: `server/hermes-client.ts`
- Create: `server/hermes-client.test.ts`
- Create: `server/chat-handler.ts`
- Create: `server/chat-handler.test.ts`
- Create: `server/index.ts`
- Modify: `vite.config.ts`
- Modify: `tsconfig.node.json`

**Interfaces:**
- Consumes: `POST /v1/runs`, `GET /v1/runs/{runId}/events`, `POST /v1/runs/{runId}/stop` on loopback Hermes.
- Produces: `POST /api/chat` as an AI SDK UI message stream and `POST /api/runs/:runId/stop`.

- [ ] **Step 1: Write failing Hermes SSE parser tests**

Use a real `ReadableStream<Uint8Array>` containing SSE frames split across chunk boundaries. Assert that `event:` names and JSON `data:` payloads are reconstructed, comments are ignored, malformed JSON becomes `invalid_result`, and abort closes the reader.

- [ ] **Step 2: Run RED**

```bash
npm test -- server/hermes-client.test.ts server/chat-handler.test.ts
```

Expected: FAIL because the server modules do not exist.

- [ ] **Step 3: Implement the loopback Hermes client**

`createHermesRun(input, sessionId)` posts to `${HERMES_BASE_URL}/v1/runs`, then `streamHermesRun(runId, signal)` consumes SSE. Read `HERMES_API_KEY` only on the server. Default `HERMES_BASE_URL` to `http://127.0.0.1:8642` and reject non-loopback URLs unless explicitly enabled.

- [ ] **Step 4: Implement the AI SDK stream response**

Use `createUIMessageStream` and `createUIMessageStreamResponse`. For each normalized Hermes event, call `mapHermesEvent` and write `data-journey` or `data-pupu` parts. Return safe typed errors and an opaque reference; do not stream raw exceptions.

- [ ] **Step 5: Serve Vite and the API from one VPS Node process**

In development, use Vite middleware mode. In production, serve `dist` and the SPA fallback. Bind the public application host from `APP_HOST`; keep Hermes loopback-only.

- [ ] **Step 6: Run GREEN and commit**

```bash
npm test -- server/hermes-client.test.ts server/chat-handler.test.ts
npm run lint
git add server vite.config.ts tsconfig.node.json
git commit -m "feat: stream Hermes runs through AI SDK"
```

### Task 6: Replace production demo dispatch with the live hook using TDD

**Files:**
- Create: `src/ai/useLiveJourney.ts`
- Create: `src/ai/useLiveJourney.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/components/home/AgentHome.tsx`
- Modify: `src/components/home/FloatingComposer.tsx`

**Interfaces:**
- Consumes: `useChat<JourneyUIMessage>`, `data-journey`, and `data-pupu` parts.
- Produces: `snapshot`, `pupuEvent`, `submit(text)`, `stop()`, `retry()`, and `reset()`.

- [ ] **Step 1: Write failing hook tests**

Assert that submitting dispatches `request.sent` immediately; data parts drive the existing reducer; a live Pupu event renders `PupuPurchaseCard`; an error never calls `createDemoPupuPurchaseEvent`; and reset returns to idle.

- [ ] **Step 2: Run RED**

```bash
npm test -- src/ai/useLiveJourney.test.tsx src/App.test.tsx
```

Expected: FAIL because the live hook is absent and App still creates demo products.

- [ ] **Step 3: Implement the live hook and update App**

All submitted tasks enter the existing canvas and use the live stream. Remove the production import and call to `createDemoPupuPurchaseEvent`. Keep demo constructors only for existing isolated visual/component tests. Hide or disable cart synchronization actions in the live first version.

- [ ] **Step 4: Run GREEN and commit**

```bash
npm test -- src/ai/useLiveJourney.test.tsx src/App.test.tsx
npm test
npm run lint
git add src
git commit -m "feat: drive LiquidJourney from live Hermes events"
```

### Task 7: Install Hermes, deploy the restricted plugin, and prove key-independent readiness

**Files:**
- Create: `deploy/hermes/config.example.yaml`
- Create: `deploy/hermes/env.example`
- Create: `deploy/hermes/install-plugin.sh`
- Create: `deploy/hermes/verify-readiness.sh`
- Modify: `.gitignore`
- External: `/home/pupu/.hermes`

**Interfaces:**
- Consumes: repository plugin, Hermes installer, VPS private environment.
- Produces: loopback Hermes Gateway configuration using `deepseek-v4-flash` and only the Pupu read-only toolset.

- [ ] **Step 1: Write deployment contract tests**

Add a Vitest test that reads deployment files and asserts: loopback binding, `deepseek-v4-flash`, no literal API key, project plugin destination, and absence of terminal/file/code-execution toolsets.

- [ ] **Step 2: Run RED, then add minimal deployment files**

```bash
npm test -- deploy/hermes/deploy-contract.test.ts
```

Expected RED before files, then GREEN after the scripts/config examples are added.

- [ ] **Step 3: Install Hermes and the plugin on the VPS**

Use the official Hermes installer, copy the plugin to `/home/pupu/.hermes/plugins/pupu_readonly`, create a private `.env` without `DEEPSEEK_API_KEY`, and configure the provider/model/base URL. Generate `API_SERVER_KEY` locally on the VPS and chmod secret files to 600.

- [ ] **Step 4: Start Hermes and record honest readiness**

Run `GET /health` and authenticated `GET /health/detailed`. Expected before the test key: liveness may pass while model readiness reports missing DeepSeek credentials. The Pupu plugin and CLI checks must be independently green.

- [ ] **Step 5: Commit deployment assets**

```bash
git add deploy .gitignore
git commit -m "ops: configure loopback Hermes gateway"
```

### Task 8: Verify the complete key-independent framework

**Files:**
- Modify only if a failing verification has a TDD reproduction.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: final evidence and the single remaining DeepSeek-key test step.

- [ ] **Step 1: Run all automated verification**

```bash
npm test
npm run lint
npm run build
npx playwright test
python3.12 -m pytest hermes/plugins/pupu_readonly/tests -q
```

Expected: all key-independent checks pass.

- [ ] **Step 2: Run live provider verification**

Run capabilities, login status, and a catalog read when auth is ready. Record real response status and redact private values.

- [ ] **Step 3: Inspect repository truth**

```bash
git status --short
git log --oneline --decorate origin/main..HEAD
git diff --check origin/main...HEAD
```

Expected: clean worktree, intentional commits only, no whitespace errors, no secrets.

- [ ] **Step 4: Stop at the test-key gate**

Report exactly which checks passed, whether CLI auth/catalog is live, and the VPS-only command the user can use to install the dedicated `DEEPSEEK_API_KEY`. Do not claim end-to-end model completion until a real Hermes + DeepSeek + Pupu browser run passes.

