import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function read(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("Hermes deployment contract", () => {
  it("keeps Hermes loopback-only on DeepSeek V4 Flash", async () => {
    const config = await read("./config.example.yaml");

    expect(config).toContain('default: "deepseek-v4-flash"');
    expect(config).toContain('base_url: "https://api.deepseek.com"');
    expect(config).toContain('host: "127.0.0.1"');
    expect(config).toContain("api_server: [pupu_readonly]");
    expect(config).toContain("- pupu-readonly");
    expect(config).not.toMatch(/terminal|code_execution|hermes-cli/);
  });

  it("contains placeholders and no committed credential", async () => {
    const environment = await read("./env.example");
    const combined = [
      environment,
      await read("./config.example.yaml"),
      await read("./install-plugin.sh"),
      await read("./verify-readiness.sh"),
    ].join("\n");

    expect(environment).toContain("DEEPSEEK_API_KEY=");
    expect(environment).toContain("API_SERVER_KEY=");
    expect(combined).not.toMatch(/sk-[A-Za-z0-9_-]{12,}/);
    expect(combined).not.toMatch(/Bearer\s+[A-Za-z0-9_-]{12,}/);
  });

  it("installs only the project read-only plugin surface", async () => {
    const installer = await read("./install-plugin.sh");

    expect(installer).toContain('hermes_home="/home/pupu/.hermes"');
    expect(installer).toContain('plugins/pupu_readonly"');
    expect(installer).toContain("hermes/plugins/pupu_readonly");
    expect(installer).not.toMatch(/cart\.add|checkout|payment|login\.request/);
    expect(installer).toContain("ensure_env_entry");
    expect(installer).toContain('ensure_env_entry "DEEPSEEK_API_KEY" ""');
    expect(installer).toContain('ensure_env_entry "API_SERVER_KEY"');
    expect(installer).not.toContain('if [[ ! -f "${hermes_home}/.env" ]]');
  });
});
