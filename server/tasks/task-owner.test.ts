import { describe, expect, it } from "vitest";
import { resolveTaskOwner } from "./task-owner";

describe("resolveTaskOwner", () => {
  it("creates a secure opaque owner cookie", () => {
    const owner = resolveTaskOwner(
      new Request("https://example.test/api/chat"),
      () => Buffer.alloc(32, 7).toString("base64url"),
    );

    expect(owner.ownerId).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(owner.setCookie).toContain("pupu_task_owner=");
    expect(owner.setCookie).toContain("HttpOnly");
    expect(owner.setCookie).toContain("SameSite=Lax");
    expect(owner.setCookie).toContain("Path=/");
    expect(owner.setCookie).toContain("Secure");
  });

  it("reuses a valid cookie without resetting it", () => {
    const token = Buffer.alloc(32, 9).toString("base64url");
    const owner = resolveTaskOwner(new Request(
      "http://localhost/api/chat",
      { headers: { cookie: `other=x; pupu_task_owner=${token}` } },
    ));

    expect(owner).toEqual({ ownerId: token });
  });

  it("does not mark localhost http cookies secure", () => {
    const owner = resolveTaskOwner(
      new Request("http://localhost/api/chat"),
      () => Buffer.alloc(32, 3).toString("base64url"),
    );

    expect(owner.setCookie).not.toContain("Secure");
  });
});
