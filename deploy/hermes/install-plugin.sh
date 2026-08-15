#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
hermes_home="/home/pupu/.hermes"
plugin_destination="${hermes_home}/plugins/pupu_cli"
skill_destination="${hermes_home}/skills/productivity/pupu-grocery"

ensure_env_entry() {
  local key="$1"
  local value="$2"
  if ! grep -q "^${key}=" "${hermes_home}/.env"; then
    printf "%s=%s\n" "${key}" "${value}" >> "${hermes_home}/.env"
  fi
}

install -d -m 700 "${hermes_home}" "${hermes_home}/plugins"
install -d -m 700 "${plugin_destination}" "${skill_destination}"
rm -rf "${hermes_home}/plugins/pupu_readonly"
rsync -a --delete --exclude "__pycache__" \
  "${repo_root}/hermes/plugins/pupu_cli/" "${plugin_destination}/"
rsync -a --delete "${repo_root}/hermes/skills/pupu-grocery/" "${skill_destination}/"

install -m 600 "${script_dir}/config.example.yaml" "${hermes_home}/config.yaml"
touch "${hermes_home}/.env"
chmod 600 "${hermes_home}/.env" "${hermes_home}/config.yaml"
chmod -R go-rwx "${plugin_destination}" "${skill_destination}"

generated_key="$(openssl rand -hex 32)"
ensure_env_entry "DEEPSEEK_API_KEY" ""
ensure_env_entry "API_SERVER_KEY" "${generated_key}"
ensure_env_entry "PUPU_CLI_PATH" "/home/pupu/providers/pupu-cli/.venv/bin/pupu"
ensure_env_entry "PUPU_OWNER_ID" "household-f3f3b74a55ae8bf60b6c1172"
ensure_env_entry "PUPU_DATA_DIR" "/home/pupu/providers/pupu-cli/.local/private"
ensure_env_entry "PUPU_ACCOUNTS_ROOT" "/home/pupu/.local/share/jiaohu/pupu-accounts"
ensure_env_entry "PUPU_LOGIN_RUNTIME_ROOT" "/home/pupu/.local/state/jiaohu/pupu-login"
ensure_env_entry "APP_PUBLIC_ORIGIN" "https://38.76.171.131:8443"

printf "Installed the complete Pupu CLI plugin and Hermes configuration.\n"
