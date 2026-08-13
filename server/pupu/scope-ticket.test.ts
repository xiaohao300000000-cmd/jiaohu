import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PupuScopeTicketStore, type PupuScopeTicketInput } from "./scope-ticket";

function input(overrides: Partial<PupuScopeTicketInput> = {}): PupuScopeTicketInput {
  return {
    sessionId: "journey-1",
    taskId: "task-1",
    taskVersion: 3,
    capabilities: ["commerce.catalog.search"],
    accountId: "acct_0123456789abcdef0123456789abcdef",
    accountsRoot: "/srv/accounts",
    dataRoot: "/srv/data",
    receiverId: "receiver-a",
    storeId: "store-a",
    placeId: "place-a",
    ...overrides,
  };
}

describe("PupuScopeTicketStore", () => {
  it("atomically writes a private task-bound ticket without credentials", async () => {
    const root = await mkdtemp(join(tmpdir(), "pupu-ticket-"));
    const store = new PupuScopeTicketStore({ root, ttlMs: 60_000, now: () => 1000 });
    const issued = await store.issue(input());
    const raw = await readFile(issued.path, "utf8");
    const value = JSON.parse(raw);

    expect(value).toMatchObject({
      version: 2,
      sessionId: "journey-1",
      taskId: "task-1",
      taskVersion: 3,
      capabilities: ["commerce.catalog.search"],
      receiverId: "receiver-a",
      storeId: "store-a",
      placeId: "place-a",
    });
    expect(value.expiresAt).toBe(new Date(61_000).toISOString());
    expect(raw).not.toMatch(/phone|token|cookie|authorization/i);
    expect((await stat(root)).mode & 0o777).toBe(0o700);
    expect((await stat(issued.path)).mode & 0o777).toBe(0o600);
  });

  it("rejects unsafe identity, roots, versions, and capabilities", async () => {
    const root = await mkdtemp(join(tmpdir(), "pupu-ticket-"));
    const store = new PupuScopeTicketStore({ root, ttlMs: 60_000 });
    await expect(store.issue(input({
      sessionId: "../escape",
      accountId: "acct_bad",
      accountsRoot: "relative",
    }))).rejects.toThrow("unsafe");
    await expect(store.issue(input({
      taskVersion: 0,
    }))).rejects.toThrow("unsafe");
    await expect(store.issue(input({
      capabilities: ["commerce.cart.write"] as PupuScopeTicketInput["capabilities"],
    }))).rejects.toThrow("unsafe");
  });

  it("removes only the completed run ticket", async () => {
    const root = await mkdtemp(join(tmpdir(), "pupu-ticket-"));
    const store = new PupuScopeTicketStore({ root, ttlMs: 60_000, now: () => 1000 });
    const first = await store.issue(input({ sessionId: "journey-a" }));
    const second = await store.issue(input({ sessionId: "journey-b" }));

    await store.remove("journey-a");

    await expect(stat(first.path)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(second.path)).resolves.toBeDefined();
  });

  it("sweeps only expired tickets", async () => {
    let now = 1000;
    const root = await mkdtemp(join(tmpdir(), "pupu-ticket-"));
    const store = new PupuScopeTicketStore({ root, ttlMs: 60_000, now: () => now });
    const expired = await store.issue(input({ sessionId: "journey-expired" }));
    now = 31_000;
    const active = await store.issue(input({ sessionId: "journey-active" }));
    now = 62_000;

    expect(await store.sweepExpired()).toBe(1);
    await expect(stat(expired.path)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(active.path)).resolves.toBeDefined();
  });
});
