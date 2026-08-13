#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
provider_root="${1:-/home/pupu/providers/pupu-cli}"
patch_file="$repo_root/deploy/pupu/address-command.patch"
if patch --dry-run -p1 -d "$provider_root" < "$patch_file" >/dev/null 2>&1; then
  patch -p1 -d "$provider_root" < "$patch_file"
elif patch -R --dry-run -p1 -d "$provider_root" < "$patch_file" >/dev/null 2>&1; then
  echo "Pupu address command is already installed"
else
  echo "Pupu provider tree does not match the expected patch" >&2
  exit 1
fi
PYTHONPATH="$provider_root/src" "$provider_root/.venv/bin/python" -m pytest -q \
  "$provider_root/tests/test_address_command.py"
