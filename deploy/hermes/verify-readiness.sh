#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
hermes_home="/home/pupu/.hermes"
pupu_python="/home/pupu/providers/pupu-cli/.venv/bin/python"

set -a
source "${hermes_home}/.env"
set +a

cd "${repo_root}"
PYTHONPATH=. "${pupu_python}" -m pytest hermes/plugins/pupu_cli/tests -q
PYTHONPATH=. "${pupu_python}" -c "
from hermes.plugins.pupu_cli.provider import run_pupu
print(run_pupu('capabilities', ['--json']))
"

if command -v hermes >/dev/null 2>&1; then
  hermes plugins list
fi

curl -fsS http://127.0.0.1:8642/health
