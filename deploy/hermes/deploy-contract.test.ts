import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Hermes Pupu CLI deployment contract", () => {
  it("registers the complete Pupu CLI connection without a read-only plugin", async () => {
    const config = await readFile("deploy/hermes/config.example.yaml", "utf8");
    const installer = await readFile("deploy/hermes/install-plugin.sh", "utf8");
    const skill = await readFile("hermes/skills/pupu-grocery/SKILL.md", "utf8");

    expect(config).toContain("- pupu-cli");
    expect(config).toContain(
      "api_server: [pupu_cli, memory, skills, session_search]",
    );
    expect(config).toContain("memory_enabled: true");
    expect(config).toContain("user_profile_enabled: true");
    expect(config).toContain("complete installed Pupu CLI");
    expect(config).toContain("tool_search:");
    expect(config).toContain("enabled: off");
    expect(config).not.toMatch(/readonly|read-only|TaskCoordinator|TaskPhase|nextActions|Harness/i);
    expect(installer).toContain("plugins/pupu_cli");
    expect(installer).toContain('"${repo_root}/hermes/skills/pupu-grocery/"');
    expect(skill).toContain('operation `cart`');
    expect(skill).toContain('scoped-add');
    expect(skill).toContain('--approval-token');
    expect(skill).toContain('operation `checkout`');
    expect(skill).toContain('operation `invite-pay`');

    expect(config).toContain("If login status returns auth_required, stop");
    expect(config).not.toContain("Start by calling capabilities");
    expect(installer).toContain('rm -rf "${hermes_home}/plugins/pupu_readonly"');
    expect(config).toContain("--household-id");
    expect(config).not.toContain("--accounts-root");
    expect(config).toContain("perform only the operation the user asked for");
    expect(config).toContain("do not call account refresh, capabilities");
    expect(config).toContain("return N candidates");
    expect(config).toContain("exact product records");
    expect(config).toContain("session_search to recover");
    expect(config).toContain("small page size");
    expect(config).toContain("do not re-run a search");
    expect(config).toContain("do not keep retrying");
    expect(skill).toContain('"--size", "5"');
  });
});
