import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PupuScopeTicketStore } from "./scope-ticket";

describe("PupuScopeTicketStore", () => {
  it("atomically writes a private short-lived ticket without credentials", async () => {
    const root = await mkdtemp(join(tmpdir(), "pupu-ticket-"));
    const store = new PupuScopeTicketStore({ root, ttlMs: 60_000, now: () => 1000 });
    const issued = await store.issue({
      sessionId: "journey-1",
      accountId: "acct_0123456789abcdef0123456789abcdef",
      accountsRoot: "/srv/accounts",
      dataRoot: "/srv/data",
    });
    const raw = await readFile(issued.path, "utf8");
    const value = JSON.parse(raw);

    expect(value).toMatchObject({ version: 1, sessionId: "journey-1" });
    expect(value.expiresAt).toBe(new Date(61_000).toISOString());
    expect(raw).not.toMatch(/phone|token|cookie|authorization/i);
    expect((await stat(root)).mode & 0o777).toBe(0o700);
    expect((await stat(issued.path)).mode & 0o777).toBe(0o600);
  });

  it("rejects unsafe identity and roots", async () => {
    const root = await mkdtemp(join(tmpdir(), "pupu-ticket-"));
    const store = new PupuScopeTicketStore({ root, ttlMs: 60_000 });
    await expect(store.issue({
      sessionId: "../escape", accountId: "acct_bad",
      accountsRoot: "relative", dataRoot: "/srv/data",
    })).rejects.toThrow("unsafe");
  });
});

