import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AccountStorage, StoredAccount } from "./types";

const DEFAULT_STORAGE_PATH = path.join(
  os.homedir(),
  ".config",
  "opencode",
  "anthropic-accounts.json",
);

const DEFAULT_STORAGE: AccountStorage = {
  version: 1,
  accounts: [],
  activeIndex: 0,
};

function cloneDefaultStorage(): AccountStorage {
  return {
    version: 1,
    accounts: [],
    activeIndex: 0,
  };
}

function resolveStoragePath(storagePath?: string): string {
  return storagePath ?? DEFAULT_STORAGE_PATH;
}

function normalizeStorage(input: unknown): AccountStorage {
  if (!input || typeof input !== "object") {
    return cloneDefaultStorage();
  }

  const candidate = input as Partial<AccountStorage>;
  const accounts = Array.isArray(candidate.accounts) ? candidate.accounts : [];
  const normalizedAccounts = accounts.map((entry) => {
    const account = entry as StoredAccount;
    const normalized: StoredAccount = {
      ...account,
      enabled: account.enabled ?? true,
      addedAt: typeof account.addedAt === "number" ? account.addedAt : Date.now(),
      refresh: account.refresh,
    };

    if (
      typeof normalized.rateLimitedUntil === "number" &&
      normalized.rateLimitedUntil < Date.now()
    ) {
      delete normalized.rateLimitedUntil;
    }

    return normalized;
  });

  const rawActiveIndex = typeof candidate.activeIndex === "number" ? candidate.activeIndex : 0;
  const maxIndex = Math.max(0, normalizedAccounts.length - 1);
  const activeIndex =
    normalizedAccounts.length === 0
      ? 0
      : Math.min(Math.max(0, Math.trunc(rawActiveIndex)), maxIndex);

  return {
    version: 1,
    accounts: normalizedAccounts,
    activeIndex,
  };
}

export function getStoragePath(): string {
  return DEFAULT_STORAGE_PATH;
}

export function loadAccounts(storagePath?: string): AccountStorage {
  const finalPath = resolveStoragePath(storagePath);

  if (!fs.existsSync(finalPath)) {
    return cloneDefaultStorage();
  }

  const raw = fs.readFileSync(finalPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;

  return normalizeStorage(parsed);
}

export function saveAccounts(data: AccountStorage, storagePath?: string): void {
  const finalPath = resolveStoragePath(storagePath);
  const parentDir = path.dirname(finalPath);
  fs.mkdirSync(parentDir, { recursive: true });

  const normalized = normalizeStorage(data);
  const tempPath = `${finalPath}.${process.pid}.${Date.now()}.tmp`;
  const content = `${JSON.stringify(normalized, null, 2)}\n`;

  fs.writeFileSync(tempPath, content, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tempPath, finalPath);
  fs.chmodSync(finalPath, 0o600);
}

export function addAccount(account: StoredAccount, storagePath?: string): AccountStorage {
  const data = loadAccounts(storagePath);
  data.accounts.push(account);
  saveAccounts(data, storagePath);
  return data;
}

export function removeAccount(index: number, storagePath?: string): AccountStorage {
  const data = loadAccounts(storagePath);
  if (index < 0 || index >= data.accounts.length) {
    return data;
  }

  data.accounts.splice(index, 1);

  if (data.accounts.length === 0) {
    data.activeIndex = 0;
  } else if (index < data.activeIndex) {
    data.activeIndex -= 1;
  } else if (data.activeIndex >= data.accounts.length) {
    data.activeIndex = data.accounts.length - 1;
  }

  saveAccounts(data, storagePath);
  return data;
}

export function getAccount(index: number, storagePath?: string): StoredAccount | undefined {
  const data = loadAccounts(storagePath);
  return data.accounts[index];
}

export function importFromAuthJson(authJsonPath: string, _storagePath?: string): StoredAccount | null {
  if (!fs.existsSync(authJsonPath)) {
    return null;
  }

  const raw = fs.readFileSync(authJsonPath, "utf8");
  const parsed = JSON.parse(raw) as {
    anthropic?: {
      type?: string;
      refresh?: string;
      access?: string;
      expires?: number;
    };
  };

  const anthropic = parsed.anthropic;
  if (!anthropic || anthropic.type !== "oauth" || !anthropic.refresh) {
    return null;
  }

  return {
    refresh: anthropic.refresh,
    access: anthropic.access,
    expires: anthropic.expires,
    addedAt: Date.now(),
    enabled: true,
  };
}
