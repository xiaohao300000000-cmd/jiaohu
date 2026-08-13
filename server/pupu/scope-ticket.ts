import { randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdir, open, readdir, readFile, rename, unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const ACCOUNT = /^acct_[a-f0-9]{32}$/;

export interface PupuScopeTicketInput {
  sessionId: string;
  accountId: string;
  accountsRoot: string;
  dataRoot: string;
  receiverId?: string;
  storeId?: string;
  placeId?: string;
}

interface Options {
  root: string;
  ttlMs: number;
  now?: () => number;
}

export class PupuScopeTicketStore {
  private readonly now: () => number;

  constructor(private readonly options: Options) {
    if (!Number.isInteger(options.ttlMs) || options.ttlMs < 1_000 || options.ttlMs > 300_000) {
      throw new Error("scope ticket TTL is invalid");
    }
    this.now = options.now || Date.now;
  }

  async issue(input: PupuScopeTicketInput): Promise<{ path: string }> {
    if (
      !SAFE_ID.test(input.sessionId) ||
      !ACCOUNT.test(input.accountId) ||
      !isAbsolute(input.accountsRoot) ||
      !isAbsolute(input.dataRoot) ||
      (input.receiverId !== undefined && !SAFE_ID.test(input.receiverId)) ||
      (input.storeId !== undefined && !SAFE_ID.test(input.storeId)) ||
      (input.placeId !== undefined && !SAFE_ID.test(input.placeId))
    ) {
      throw new Error("unsafe Pupu scope ticket");
    }
    await mkdir(this.options.root, { recursive: true, mode: 0o700 });
    await chmod(this.options.root, 0o700);
    const destination = join(this.options.root, `${input.sessionId}.json`);
    const temporary = join(this.options.root, `.${randomUUID()}.tmp`);
    const value = {
      version: 1,
      ...input,
      expiresAt: new Date(this.now() + this.options.ttlMs).toISOString(),
      nonce: randomBytes(16).toString("hex"),
    };
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(JSON.stringify(value), "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await rename(temporary, destination);
      await chmod(destination, 0o600);
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
    return { path: destination };
  }

  async remove(sessionId: string): Promise<void> {
    if (!SAFE_ID.test(sessionId)) return;
    await unlink(join(this.options.root, `${sessionId}.json`)).catch(() => undefined);
  }
  async sweepExpired(): Promise<number> {
    const entries = await readdir(this.options.root, { withFileTypes: true })
      .catch(() => []);
    let removed = 0;
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const path = join(this.options.root, entry.name);
      let expiresAt = Number.NaN;
      try {
        const value = JSON.parse(await readFile(path, "utf8")) as { expiresAt?: unknown };
        if (typeof value.expiresAt === "string") {
          expiresAt = Date.parse(value.expiresAt);
        }
      } catch {
        expiresAt = Number.NaN;
      }
      if (!Number.isFinite(expiresAt) || expiresAt <= this.now()) {
        await unlink(path).catch(() => undefined);
        removed += 1;
      }
    }
    return removed;
  }
}

