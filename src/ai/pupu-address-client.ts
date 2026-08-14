import type { TaskSnapshot } from "../domain/task-contract";

export interface SavedPupuAddress {
  id: string;
  label: string;
  region: string;
  detailHint: string;
  phoneSuffix: string;
}

function validateAddress(value: unknown): SavedPupuAddress {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid Pupu address response");
  }
  const item = value as Record<string, unknown>;
  const allowed = new Set(["id", "label", "region", "detailHint", "phoneSuffix"]);
  if (Object.keys(item).some((key) => !allowed.has(key))) {
    throw new Error("invalid Pupu address response");
  }
  for (const key of allowed) {
    if (typeof item[key] !== "string") throw new Error("invalid Pupu address response");
  }
  return item as unknown as SavedPupuAddress;
}

async function responseJson(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error("Pupu address request failed");
  return response.json();
}

export function createPupuAddressClient(fetcher: typeof fetch = fetch) {
  return {
    async list(): Promise<{ addresses: SavedPupuAddress[] }> {
      const value = await responseJson(await fetcher("/api/pupu/addresses", {
        credentials: "same-origin",
      }));
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("invalid Pupu address response");
      }
      const addresses = (value as { addresses?: unknown }).addresses;
      if (!Array.isArray(addresses)) throw new Error("invalid Pupu address response");
      return { addresses: addresses.map(validateAddress) };
    },
    async select(
      task: Pick<TaskSnapshot, "taskId" | "version">,
      receiverId: string,
    ): Promise<TaskSnapshot> {
      if (!/^[A-Za-z0-9-]{1,64}$/.test(receiverId)) {
        throw new Error("invalid Pupu address");
      }
      const value = await responseJson(await fetcher("/api/pupu/addresses/select", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          taskId: task.taskId,
          taskVersion: task.version,
          receiverId,
        }),
      }));
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("invalid Pupu address response");
      }
      const next = (value as { task?: unknown }).task;
      if (
        !next ||
        typeof next !== "object" ||
        (next as { taskId?: unknown }).taskId !== task.taskId ||
        !Number.isInteger((next as { version?: unknown }).version)
      ) {
        throw new Error("invalid Pupu address response");
      }
      return next as TaskSnapshot;
    },
  };
}
