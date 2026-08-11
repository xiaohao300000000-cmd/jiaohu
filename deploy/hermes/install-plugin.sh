#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
hermes_home="/home/pupu/.hermes"
plugin_destination="${hermes_home}/plugins/pupu_readonly"

ensure_env_entry() {
  local key="$1"
  local value="$2"
  if ! grep -q "^${key}=" "${hermes_home}/.env"; then
    printf '%s=%s\n' "${key}" "${value}" >> "${hermes_home}/.env"
  fi
}

install -d -m 700 "${hermes_home}" "${hermes_home}/plugins" "${hermes_home}/run-artifacts"
install -d -m 700 "${plugin_destination}"
rsync -a --delete   --exclude "__pycache__"   "${repo_root}/hermes/plugins/pupu_readonly/"   "${plugin_destination}/"

install -m 600 "${script_dir}/config.example.yaml" "${hermes_home}/config.yaml"
touch "${hermes_home}/.env"
chmod 600 "${hermes_home}/.env" "${hermes_home}/config.yaml"
chmod -R go-rwx "${plugin_destination}" "${hermes_home}/run-artifacts"

generated_key="$(openssl rand -hex 32)"
ensure_env_entry "DEEPSEEK_API_KEY" ""
ensure_env_entry "API_SERVER_KEY" "${generated_key}"
ensure_env_entry "PUPU_CLI_PATH" "/home/pupu/providers/pupu-cli/.venv/bin/pupu"
ensure_env_entry "PUPU_DATA_DIR" "/home/pupu/providers/pupu-cli/.local/private"
ensure_env_entry "PUPU_HOUSEHOLD_ID" "household-f3f3b74a55ae8bf60b6c1172"
ensure_env_entry "PUPU_RESULT_DIR" "/home/pupu/.hermes/run-artifacts"
ensure_env_entry "PUPU_TOOL_TIMEOUT_SECONDS" "75"

printf 'Installed pupu-readonly plugin and loopback Hermes configuration.\n'
printf 'DEEPSEEK_API_KEY remains unset until the dedicated test key is supplied.\n'
