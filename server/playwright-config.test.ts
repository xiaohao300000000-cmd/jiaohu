import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Playwright server contract", () => {
  it("starts and probes the integrated app server on the same address", async () => {
    const config = await readFile(resolve("playwright.config.ts"), "utf8");

    expect(config).toContain(
      'command: "APP_HOST=127.0.0.1 APP_PORT=4173 npm run dev"',
    );
    expect(config).toContain('baseURL: "http://127.0.0.1:4173"');
    expect(config).toContain('url: "http://127.0.0.1:4173"');
  });
});
