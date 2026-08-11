import { readFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const SAFE_IDENTITY_PART = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/;
const DEFAULT_RESULT_DIR = "/home/pupu/.hermes/run-artifacts";
const DEFAULT_MAX_AGE_MS = 5 * 60_000;

const artifactEnvelopeSchema = z.object({
  task_id: z.string().min(1),
  tool_name: z.string().min(1),
  sequence: z.number().int().positive(),
  run_id: z.string().min(1).optional(),
  tool_call_id: z.string().min(1).optional(),
  created_at: z.string().min(1),
  result: z.unknown(),
});

export interface ToolArtifactIdentity {
  sessionId: string;
  runId: string;
  toolCallId: string;
  toolName: string;
  sequence: number;
}

export type ToolArtifactReadResult =
  | { status: "ok"; result: unknown }
  | { status: "missing" | "invalid" | "stale" };

interface ReadToolArtifactOptions {
  resultDir?: string;
  maxAgeMs?: number;
  now?: () => number;
}

function hasSafeIdentity(identity: ToolArtifactIdentity): boolean {
  return (
    SAFE_IDENTITY_PART.test(identity.sessionId) &&
    SAFE_IDENTITY_PART.test(identity.runId) &&
    SAFE_IDENTITY_PART.test(identity.toolCallId) &&
    SAFE_IDENTITY_PART.test(identity.toolName) &&
    Number.isSafeInteger(identity.sequence) &&
    identity.sequence > 0
  );
}

async function consume(pathname: string): Promise<string | null> {
  try {
    const content = await readFile(pathname, "utf8");
    await unlink(pathname);
    return content;
  } catch {
    return null;
  }
}

export async function readToolArtifact(
  identity: ToolArtifactIdentity,
  options: ReadToolArtifactOptions = {},
): Promise<ToolArtifactReadResult> {
  if (!hasSafeIdentity(identity)) return { status: "invalid" };

  const resultDir =
    options.resultDir || process.env.PUPU_RESULT_DIR || DEFAULT_RESULT_DIR;
  const sequence = String(identity.sequence).padStart(6, "0");
  const prefix = `${identity.sessionId}.${sequence}.`;
  let matches: string[];
  try {
    matches = (await readdir(resultDir)).filter(
      (name) =>
        name.startsWith(prefix) &&
        name.endsWith(".json") &&
        SAFE_IDENTITY_PART.test(name.slice(prefix.length, -5)),
    );
  } catch {
    return { status: "missing" };
  }

  if (matches.length === 0) return { status: "missing" };
  if (matches.length !== 1) return { status: "invalid" };

  const content = await consume(path.join(resultDir, matches[0]));
  if (content === null) return { status: "missing" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { status: "invalid" };
  }

  const envelope = artifactEnvelopeSchema.safeParse(parsed);
  if (!envelope.success) return { status: "invalid" };
  const artifact = envelope.data;
  if (
    artifact.task_id !== identity.sessionId ||
    artifact.tool_name !== identity.toolName ||
    artifact.sequence !== identity.sequence ||
    (artifact.run_id !== undefined && artifact.run_id !== identity.runId) ||
    (artifact.tool_call_id !== undefined &&
      artifact.tool_call_id !== identity.toolCallId)
  ) {
    return { status: "invalid" };
  }

  const createdAt = Date.parse(artifact.created_at);
  if (!Number.isFinite(createdAt)) return { status: "invalid" };
  const now = options.now?.() ?? Date.now();
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  if (now - createdAt > maxAgeMs) return { status: "stale" };

  return { status: "ok", result: artifact.result };
}
