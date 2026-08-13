import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";
import type { CommerceOperation, CommerceProviderResult, PupuCommerceScope } from "./commerce-types";
const ACCOUNT = /^acct_[a-f0-9]{32}$/;
function validateScope(scope: PupuCommerceScope): void {
  if (!isAbsolute(scope.cliPath) || !ACCOUNT.test(scope.accountId) ||
      !isAbsolute(scope.accountsRoot) || !isAbsolute(scope.dataRoot)) {
    throw new Error("Pupu commerce scope is unsafe");
  }
}
export function buildCommerceCommand(scope: PupuCommerceScope, operation: CommerceOperation): string[] {
  validateScope(scope);
  if (operation.kind !== "listAddresses") throw new Error("Pupu commerce operation is not allowlisted");
  return [scope.cliPath, "address", "list", "--account-id", scope.accountId,
    "--accounts-root", scope.accountsRoot, "--data-root", scope.dataRoot, "--json"];
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
    let size = 0;
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1_000_000) child.kill(); else chunks.push(chunk);
    });
    child.once("error", reject);
    child.once("close", () => {
      if (size > 1_000_000) return reject(new Error("provider output exceeded limit"));
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as CommerceProviderResult);
      } catch {
        reject(new Error("provider returned invalid JSON"));
      }
    });
  });
}
