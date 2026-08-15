import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdir, open, readFile, rename, rm, unlink } from "node:fs/promises";
import { join } from "node:path";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const ACCOUNT_PATTERN = /^acct_[a-f0-9]{32}$/;

interface SessionRecord {
  sessionHash: string;
  accountId: string;
  createdAt: string;
}

export interface PupuSessionStoreOptions {
  root: string;
  accountsRoot: string;
}

export interface ResolvedPupuSession {
  token: string;
  accountId: string;
  accountDir: string;
  recordPath: string;
  created: boolean;
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function ensurePrivateDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  await chmod(path, 0o700);
}

export class PupuSessionStore {
  constructor(private readonly options: PupuSessionStoreOptions) {}

  private recordPath(hash: string): string {
    return join(this.options.root, `session-${hash}.json`);
  }

  private async read(token: string): Promise<ResolvedPupuSession | null> {
    if (!TOKEN_PATTERN.test(token)) return null;
    const hash = tokenHash(token);
    const recordPath = this.recordPath(hash);
    try {
      const value = JSON.parse(await readFile(recordPath, "utf8")) as Partial<SessionRecord>;
      if (
        value.sessionHash !== hash ||
        typeof value.accountId !== "string" ||
        !ACCOUNT_PATTERN.test(value.accountId) ||
        typeof value.createdAt !== "string"
      ) {
        return null;
      }
      const accountDir = join(this.options.accountsRoot, value.accountId);
      await ensurePrivateDirectory(accountDir);
      return { token, accountId: value.accountId, accountDir, recordPath, created: false };
    } catch {
      return null;
    }
  }

  async lookup(candidate?: string): Promise<ResolvedPupuSession | null> {
    if (!candidate) return null;
    return this.read(candidate);
  }

  async resolve(candidate?: string): Promise<ResolvedPupuSession> {
    await ensurePrivateDirectory(this.options.root);
    await ensurePrivateDirectory(this.options.accountsRoot);
    if (candidate) {
      const existing = await this.read(candidate);
      if (existing) return existing;
    }

    const token = randomBytes(32).toString("base64url");
    const hash = tokenHash(token);
    const accountId = `acct_${randomBytes(16).toString("hex")}`;
    const recordPath = this.recordPath(hash);
    const accountDir = join(this.options.accountsRoot, accountId);
    await ensurePrivateDirectory(accountDir);
    const record: SessionRecord = {
      sessionHash: hash,
      accountId,
      createdAt: new Date().toISOString(),
    };
    const temporary = join(this.options.root, `.${randomUUID()}.tmp`);
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(JSON.stringify(record), "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await rename(temporary, recordPath);
      await chmod(recordPath, 0o600);
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
    return { token, accountId, accountDir, recordPath, created: true };
  }

  async remove(session: ResolvedPupuSession): Promise<void> {
    const expectedRecord = this.recordPath(tokenHash(session.token));
    const expectedAccount = join(this.options.accountsRoot, session.accountId);
    if (
      !ACCOUNT_PATTERN.test(session.accountId) ||
      session.recordPath !== expectedRecord ||
      session.accountDir !== expectedAccount
    ) {
      throw new Error("unsafe Pupu session removal");
    }
    await unlink(expectedRecord).catch(() => undefined);
    await rm(expectedAccount, { recursive: true, force: true });
}
}
