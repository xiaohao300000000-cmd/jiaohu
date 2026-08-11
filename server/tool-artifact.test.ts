import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readToolArtifact, type ToolArtifactIdentity } from "./tool-artifact";

const identity: ToolArtifactIdentity = {
  sessionId: "session-1",
  runId: "run-1",
  toolCallId: "run-1:pupu_search_catalog:1",
  toolName: "pupu_search_catalog",
  sequence: 1,
};

let resultDir = "";

function artifact(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    task_id: identity.sessionId,
    tool_name: identity.toolName,
    sequence: identity.sequence,
    created_at: "2026-08-11T04:00:00.000Z",
    result: { ok: true, operation: "pupu.catalog.search" },
    ...overrides,
  };
}

async function writeArtifact(
  sequence: number,
  value: unknown,
  suffix = "artifact",
) {
  await mkdir(resultDir, { recursive: true });
  await writeFile(
    path.join(
      resultDir,
      `${identity.sessionId}.${String(sequence).padStart(6, "0")}.${suffix}.json`,
    ),
    typeof value === "string" ? value : JSON.stringify(value),
    "utf8",
  );
}

beforeEach(async () => {
  resultDir = await mkdtemp(path.join(tmpdir(), "jiaohu-artifacts-"));
});

afterEach(async () => {
  await rm(resultDir, { recursive: true, force: true });
});

describe("readToolArtifact", () => {
  it("reads two consecutive tool artifacts by sequence without overwriting", async () => {
    await writeArtifact(1, artifact());
    await writeArtifact(
      2,
      artifact({
        sequence: 2,
        tool_name: "pupu_read_cart",
        result: { ok: true, operation: "pupu.cart.read" },
      }),
    );

    const first = await readToolArtifact(identity, {
      resultDir,
      now: () => Date.parse("2026-08-11T04:01:00.000Z"),
    });
    const second = await readToolArtifact(
      {
        ...identity,
        toolCallId: "run-1:pupu_read_cart:2",
        toolName: "pupu_read_cart",
        sequence: 2,
      },
      {
        resultDir,
        now: () => Date.parse("2026-08-11T04:01:00.000Z"),
      },
    );

    expect(first).toMatchObject({
      status: "ok",
      result: { operation: "pupu.catalog.search" },
    });
    expect(second).toMatchObject({
      status: "ok",
      result: { operation: "pupu.cart.read" },
    });
  });

  it("returns missing when no matching artifact exists", async () => {
    await expect(readToolArtifact(identity, { resultDir })).resolves.toEqual({
      status: "missing",
    });
  });

  it("rejects task, tool, run, or tool-call identity mismatches", async () => {
    await writeArtifact(
      1,
      artifact({
        task_id: "another-session",
        run_id: "another-run",
        tool_call_id: "another-call",
      }),
    );

    await expect(
      readToolArtifact(identity, {
        resultDir,
        now: () => Date.parse("2026-08-11T04:01:00.000Z"),
      }),
    ).resolves.toEqual({ status: "invalid" });
  });

  it("rejects malformed artifacts", async () => {
    await writeArtifact(1, "{broken-json");

    await expect(readToolArtifact(identity, { resultDir })).resolves.toEqual({
      status: "invalid",
    });
  });

  it("rejects stale artifacts", async () => {
    await writeArtifact(
      1,
      artifact({ created_at: "2026-08-11T03:00:00.000Z" }),
    );

    await expect(
      readToolArtifact(identity, {
        resultDir,
        maxAgeMs: 5 * 60_000,
        now: () => Date.parse("2026-08-11T04:00:00.000Z"),
      }),
    ).resolves.toEqual({ status: "stale" });
  });
});
