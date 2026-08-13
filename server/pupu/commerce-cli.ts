import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";
import type { CommerceOperation, CommerceProviderResult, PupuCommerceScope } from "./commerce-types";
const ACCOUNT = /^acct_[a-f0-9]{32}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/;
function validateScope(scope: PupuCommerceScope): void {
  if (!isAbsolute(scope.cliPath) || !ACCOUNT.test(scope.accountId) ||
      !isAbsolute(scope.accountsRoot) || !isAbsolute(scope.dataRoot)) {
    throw new Error("Pupu commerce scope is unsafe");
  }
}
function validateBinding(operation: Exclude<CommerceOperation, { kind: "listAddresses" }>): void {
  const { binding } = operation;
  if (![binding.receiverId, binding.storeId, binding.placeId, operation.requestId].every((value) => SAFE_ID.test(value)) ||
      !Number.isSafeInteger(binding.placeZip) || binding.placeZip <= 0) {
    throw new Error("Pupu commerce binding is unsafe");
  }
}
function scopedBase(scope: PupuCommerceScope, operation: Exclude<CommerceOperation, { kind: "listAddresses" }>): string[] {
  validateBinding(operation);
  return [
    "--account-id", scope.accountId,
    "--accounts-root", scope.accountsRoot,
    "--store-id", operation.binding.storeId,
    "--place-id", operation.binding.placeId,
    "--receiver-id", operation.binding.receiverId,
    "--request-id", operation.requestId,
    "--data-root", scope.dataRoot,
  ];
}
export function buildCommerceCommand(scope: PupuCommerceScope, operation: CommerceOperation): string[] {
  validateScope(scope);
  if (operation.kind === "listAddresses") {
    return [scope.cliPath, "address", "list", "--account-id", scope.accountId,
      "--accounts-root", scope.accountsRoot, "--data-root", scope.dataRoot, "--json"];
  }
  if (!["readCart", "addCartItem", "checkoutPreview", "checkoutCreate"].includes(operation.kind)) {
    throw new Error("Pupu commerce operation is not allowlisted");
  }
  const common = scopedBase(scope, operation);
  switch (operation.kind) {
    case "readCart":
      return [scope.cliPath, "cart", "scoped-read", ...common, "--json"];
    case "addCartItem":
      if (!isAbsolute(operation.itemPath) || !SAFE_ID.test(operation.actorId)) throw new Error("Pupu cart operation is unsafe");
      return [scope.cliPath, "cart", "scoped-add", "--item", operation.itemPath,
        "--actor-id", operation.actorId, ...common, "--json"];
    case "checkoutPreview":
      return [scope.cliPath, "checkout", "scoped-preview", ...common, "--json"];
    case "checkoutCreate":
      if (!SAFE_ID.test(operation.previewId) || !SAFE_ID.test(operation.actorId)) throw new Error("Pupu checkout operation is unsafe");
      return [scope.cliPath, "checkout", "scoped-create-from-preview",
        "--preview-id", operation.previewId, "--actor-id", operation.actorId, ...common, "--json"];
    default:
      throw new Error("Pupu commerce operation is not allowlisted");
  }
}
export async function executeCommerceCommand(
  scope: PupuCommerceScope, operation: CommerceOperation, signal?: AbortSignal,
): Promise<CommerceProviderResult> {
  const argv = buildCommerceCommand(scope, operation);
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), {
      shell: false, stdio: ["ignore", "pipe", "pipe"], signal, env: process.env,
    });
    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    let size = 0;
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1_000_000) child.kill(); else chunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (Buffer.concat(errors).length < 64_000) errors.push(chunk);
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (size > 1_000_000) return reject(new Error("provider output exceeded limit"));
      try {
        const result = JSON.parse(Buffer.concat(chunks).toString("utf8")) as CommerceProviderResult;
        if (code !== 0 && !result.error) return reject(new Error("provider command failed"));
        resolve(result);
      } catch {
        reject(new Error("provider returned invalid JSON"));
      }
    });
  });
}
