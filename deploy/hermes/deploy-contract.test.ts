import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Hermes Pupu CLI deployment contract", () => {
  it("registers the complete Pupu CLI connection without a read-only plugin", async () => {
    const config = await readFile("deploy/hermes/config.example.yaml", "utf8");
    const installer = await readFile("deploy/hermes/install-plugin.sh", "utf8");

    expect(config).toContain("- pupu-cli");
    expect(config).toContain("api_server: [pupu_cli]");
    expect(config).toContain("complete installed Pupu CLI");
    expect(config).not.toMatch(/readonly|read-only|TaskCoordinator|TaskPhase|nextActions|Harness/i);
    expect(installer).toContain("plugins/pupu_cli");
    expect(installer).not.toContain("pupu_readonly");
  });
});
