import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  addAccount,
  getAccount,
  importFromAuthJson,
  loadAccounts,
  removeAccount,
  saveAccounts,
} from "../storage";
import type { AccountStorage, StoredAccount } from "../types";

const tempDirs = new Set<string>();

function createStoragePath() {
  const baseDir = path.join(os.tmpdir(), `anthropic-multi-auth-test-${randomUUID()}`);
  tempDirs.add(baseDir);
  return {
    baseDir,
    storagePath: path.join(baseDir, "config", "opencode", "anthropic-accounts.json"),
  };
}

function account(refresh: string, extra: Partial<StoredAccount> = {}): StoredAccount {
  return {
    refresh,
    addedAt: Date.now(),
    enabled: true,
    ...extra,
  };
}

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.clear();
});

describe("storage", () => {
  it("loadAccounts returns default when storage file does not exist", () => {
    const { storagePath } = createStoragePath();

    expect(loadAccounts(storagePath)).toEqual({
      version: 1,
      accounts: [],
      activeIndex: 0,
    });
  });

  it("saveAccounts writes data and loadAccounts reads it back", () => {
    const { storagePath } = createStoragePath();
    const data: AccountStorage = {
      version: 1,
      activeIndex: 0,
      accounts: [account("r1", { email: "a@example.com" })],
    };

    saveAccounts(data, storagePath);

    expect(loadAccounts(storagePath)).toEqual(data);
  });

  it("addAccount appends account to existing list", () => {
    const { storagePath } = createStoragePath();
    saveAccounts(
      {
        version: 1,
        activeIndex: 0,
        accounts: [account("existing")],
      },
      storagePath,
    );

    const updated = addAccount(account("new"), storagePath);

    expect(updated.accounts).toHaveLength(2);
    expect(updated.accounts[0]?.refresh).toBe("existing");
    expect(updated.accounts[1]?.refresh).toBe("new");
  });

  it("removeAccount removes the correct account", () => {
    const { storagePath } = createStoragePath();
    saveAccounts(
      {
        version: 1,
        activeIndex: 0,
        accounts: [account("r1"), account("r2"), account("r3")],
      },
      storagePath,
    );

    const updated = removeAccount(1, storagePath);

    expect(updated.accounts.map((item) => item.refresh)).toEqual(["r1", "r3"]);
  });

  it("removeAccount adjusts activeIndex when removing before active", () => {
    const { storagePath } = createStoragePath();
    saveAccounts(
      {
        version: 1,
        activeIndex: 2,
        accounts: [account("r1"), account("r2"), account("r3")],
      },
      storagePath,
    );

    const updated = removeAccount(0, storagePath);

    expect(updated.activeIndex).toBe(1);
    expect(updated.accounts.map((item) => item.refresh)).toEqual(["r2", "r3"]);
  });

  it("getAccount returns account for valid index", () => {
    const { storagePath } = createStoragePath();
    const target = account("r2", { email: "target@example.com" });
    saveAccounts(
      {
        version: 1,
        activeIndex: 0,
        accounts: [account("r1"), target],
      },
      storagePath,
    );

    expect(getAccount(1, storagePath)).toEqual(target);
  });

  it("getAccount returns undefined for out-of-bounds index", () => {
    const { storagePath } = createStoragePath();
    saveAccounts(
      {
        version: 1,
        activeIndex: 0,
        accounts: [account("r1")],
      },
      storagePath,
    );

    expect(getAccount(3, storagePath)).toBeUndefined();
  });

  it("saveAccounts writes storage file with mode 0o600", () => {
    const { storagePath } = createStoragePath();
    saveAccounts(
      {
        version: 1,
        activeIndex: 0,
        accounts: [account("r1")],
      },
      storagePath,
    );

    const stat = fs.statSync(storagePath);
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it("loadAccounts clears stale rateLimitedUntil timestamps", () => {
    const { storagePath } = createStoragePath();
    const past = Date.now() - 10_000;
    saveAccounts(
      {
        version: 1,
        activeIndex: 0,
        accounts: [account("r1", { rateLimitedUntil: past })],
      },
      storagePath,
    );

    const loaded = loadAccounts(storagePath);

    expect(loaded.accounts[0]?.rateLimitedUntil).toBeUndefined();
  });

  it("loadAccounts preserves future rateLimitedUntil timestamps", () => {
    const { storagePath } = createStoragePath();
    const future = Date.now() + 60_000;
    saveAccounts(
      {
        version: 1,
        activeIndex: 0,
        accounts: [account("r1", { rateLimitedUntil: future })],
      },
      storagePath,
    );

    const loaded = loadAccounts(storagePath);

    expect(loaded.accounts[0]?.rateLimitedUntil).toBe(future);
  });

  it("importFromAuthJson reads anthropic oauth credentials", () => {
    const { baseDir } = createStoragePath();
    const authJsonPath = path.join(baseDir, "auth.json");
    fs.mkdirSync(path.dirname(authJsonPath), { recursive: true });
    fs.writeFileSync(
      authJsonPath,
      JSON.stringify({
        anthropic: {
          type: "oauth",
          refresh: "refresh-token",
          access: "access-token",
          expires: 1234567890,
        },
      }),
      "utf8",
    );

    const imported = importFromAuthJson(authJsonPath);

    expect(imported).toMatchObject({
      refresh: "refresh-token",
      access: "access-token",
      expires: 1234567890,
      enabled: true,
    });
    expect(imported?.addedAt).toBeTypeOf("number");
  });

  it("importFromAuthJson returns null when anthropic oauth creds do not exist", () => {
    const { baseDir } = createStoragePath();
    const authJsonPath = path.join(baseDir, "auth.json");
    fs.mkdirSync(path.dirname(authJsonPath), { recursive: true });
    fs.writeFileSync(
      authJsonPath,
      JSON.stringify({
        anthropic: {
          type: "api-key",
          key: "sk-ant-123",
        },
      }),
      "utf8",
    );

    expect(importFromAuthJson(authJsonPath)).toBeNull();
  });

  it("saveAccounts creates parent directory when missing", () => {
    const { storagePath } = createStoragePath();
    const parentDir = path.dirname(storagePath);

    expect(fs.existsSync(parentDir)).toBe(false);

    saveAccounts(
      {
        version: 1,
        activeIndex: 0,
        accounts: [account("r1")],
      },
      storagePath,
    );

    expect(fs.existsSync(parentDir)).toBe(true);
    expect(fs.existsSync(storagePath)).toBe(true);
  });
});
