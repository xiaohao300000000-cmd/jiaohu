import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";
import type { LoginOperation, PupuCliScope } from "./login-types";

const ACCOUNT = /^acct_[a-f0-9]{32}$/;
const PHONE = /^1\d{10}$/;
const SECRET_KEYS = new Set([
  "authorization", "captcha", "challenge", "code", "cookie", "phone",
  "refresh_token", "seal", "sign", "token",
]);

export interface LoginCommand {
  argv: string[];
  stdin?: string;
}

function validateScope(scope: PupuCliScope): void {
  if (!isAbsolute(scope.cliPath)) throw new Error("CLI path must be absolute");
  if (!ACCOUNT.test(scope.accountId)) throw new Error("account id is unsafe");
  if (!isAbsolute(scope.accountsRoot) || !isAbsolute(scope.dataRoot)) {
    throw new Error("account roots must be absolute");
  }
}

export function buildLoginCommand(
  scope: PupuCliScope,
  operation: LoginOperation,
): LoginCommand {
  validateScope(scope);
  const argv = [scope.cliPath, "login"];
  let stdin: string | undefined;
  switch (operation.kind) {
    case "status":
      argv.push("status");
      break;
    case "request":
      if (!PHONE.test(operation.phone)) throw new Error("phone is invalid");
      argv.push("request-code", "--phone", operation.phone);
      break;
    case "applyCaptcha":
      argv.push("apply-captcha");
      break;
    case "verify":
      if (!/^\d{4,8}$/.test(operation.code)) throw new Error("verification code is invalid");
      argv.push("verify-code", "--code-stdin", "--allow-session-rotation");
      stdin = `${operation.code}\n`;
      break;
  }
  argv.push(
    "--account-id", scope.accountId,
    "--accounts-root", scope.accountsRoot,
    "--data-root", scope.dataRoot,
    "--json",
  );
  return { argv, stdin };
}

export function redactProviderValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactProviderValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SECRET_KEYS.has(key.toLowerCase()))
        .map(([key, item]) => [key, redactProviderValue(item)]),
    );
  }
  return value;
}

export async function executeLoginCommand(
  scope: PupuCliScope,
  operation: LoginOperation,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const command = buildLoginCommand(scope, operation);
  return new Promise((resolve, reject) => {
    const child = spawn(command.argv[0], command.argv.slice(1), {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      signal,
      env: process.env,
    });
    const chunks: Buffer[] = [];
    let size = 0;
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1_000_000) child.kill();
      else chunks.push(chunk);
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (size > 1_000_000) return reject(new Error("provider output exceeded limit"));
      const output = Buffer.concat(chunks).toString("utf8");
      try {
        const parsed = JSON.parse(output) as Record<string, unknown>;
        if (code !== 0 && !output) return reject(new Error("provider process failed"));
        resolve(parsed);
      } catch {
        reject(new Error("provider returned invalid JSON"));
      }
    });
    child.stdin.end(command.stdin);
  });
}

