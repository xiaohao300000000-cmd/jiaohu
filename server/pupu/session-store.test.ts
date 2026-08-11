import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PupuSessionStore } from "./session-store";

describe("PupuSessionStore", () => {
  it("persists an opaque session without storing a phone", async () => {
    const root = await mkdtemp(join(tmpdir(), "pupu-session-"));
    const store = new PupuSessionStore({ root, accountsRoot: join(root, "accounts") });
    const first = await store.resolve();
    const restarted = new PupuSessionStore({ root, accountsRoot: join(root, "accounts") });
    const second = await restarted.resolve(first.token);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.accountId).toBe(first.accountId);
    expect(first.accountId).toMatch(/^acct_[a-f0-9]{32}$/);
    expect(JSON.stringify(second)).not.toContain("phone");

    const record = await readFile(first.recordPath, "utf8");
    expect(record).not.toContain(first.token);
    expect(record).not.toMatch(/phone/i);
    expect((await stat(root)).mode & 0o777).toBe(0o700);
    expect((await stat(first.recordPath)).mode & 0o777).toBe(0o600);
    expect((await stat(first.accountDir)).mode & 0o777).toBe(0o700);
  });

  it("isolates users and rejects a tampered token", async () => {
    const root = await mkdtemp(join(tmpdir(), "pupu-session-"));
    const store = new PupuSessionStore({ root, accountsRoot: join(root, "accounts") });
    const one = await store.resolve();
    const two = await store.resolve();
    const tampered = await store.resolve(one.token + "x");

    expect(new Set([one.accountId, two.accountId, tampered.accountId]).size).toBe(3);
    expect(tampered.token).not.toBe(one.token);
  });
});

