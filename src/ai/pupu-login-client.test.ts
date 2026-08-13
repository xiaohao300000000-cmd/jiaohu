import { describe, expect, it, vi } from "vitest";
import { createPupuLoginClient } from "./pupu-login-client";

describe("Pupu login client", () => {
  it("uses dedicated same-origin endpoints and typed transitions", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ phase: "sms", attemptId: "attempt-1" }),
    );
    const client = createPupuLoginClient(fetcher);
    const result = await client.start("13000000000");
    expect(result.phase).toBe("sms");
    expect(fetcher).toHaveBeenCalledWith(
      "/api/pupu/login/start",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({ phone: "13000000000" }),
      }),
    );
  });
  it("cancels the transient attempt through the dedicated endpoint", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ phase: "auth_required" }),
    );
    const client = createPupuLoginClient(fetcher);

    await client.cancel();

    expect(fetcher).toHaveBeenCalledWith(
      "/api/pupu/login/cancel",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: "{}",
      }),
    );
  });

  it("rejects an invalid response without reflecting submitted values", async () => {
    const client = createPupuLoginClient(
      vi.fn<typeof fetch>().mockResolvedValue(Response.json({ phone: "secret" })),
    );
    await expect(client.verify("123456")).rejects.toThrow("invalid login response");
  });
});

