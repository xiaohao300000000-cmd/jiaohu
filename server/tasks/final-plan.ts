import { createHash } from "node:crypto";
import { z } from "zod";

export const submitFinalPlanSchema = z.object({
  title: z.string().trim().min(1).max(120),
  explanation: z.string().trim().min(1).max(2_000),
  items: z.array(z.object({
    candidateId: z.string().uuid(),
    quantity: z.number().int().min(1).max(20),
  }).strict()).min(1).max(40),
}).strict().superRefine((value, context) => {
  const ids = value.items.map((item) => item.candidateId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({
      code: "custom",
      path: ["items"],
      message: "candidate IDs must be unique",
    });
  }
});

export type SubmitFinalPlanInput = z.infer<typeof submitFinalPlanSchema>;

export function deterministicCandidateId(
  taskId: string,
  taskVersion: number,
  runId: string,
  storeProductId: string,
): string {
  const namespace = Buffer.from(
    "6ba7b8119dad11d180b400c04fd430c8",
    "hex",
  );
  const hash = createHash("sha1")
    .update(namespace)
    .update(`${taskId}:${taskVersion}:${runId}:${storeProductId}`)
    .digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}
