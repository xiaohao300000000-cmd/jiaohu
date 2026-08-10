#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
hermes_home="/home/pupu/.hermes"
pupu_python="/home/pupu/providers/pupu-cli/.venv/bin/python"

set -a
source "${hermes_home}/.env"
set +a

cd "${repo_root}"
PYTHONPATH=. "${pupu_python}" -m pytest hermes/plugins/pupu_readonly/tests -q
PYTHONPATH=. "${pupu_python}" -c '
import json
from hermes.plugins.pupu_readonly.provider import run_pupu
for operation in ("capabilities", "login.status"):
    result = json.loads(run_pupu(operation, {}))
    print(json.dumps({
        "operation": result["operation"],
        "ok": result["ok"],
        "status": result["status"],
    }))
'

if command -v hermes >/dev/null 2>&1; then
  hermes plugins list
fi

curl -fsS http://127.0.0.1:8642/health
