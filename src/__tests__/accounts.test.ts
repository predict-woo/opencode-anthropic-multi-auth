import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveAccounts, loadAccounts } from "../storage";
import type { StoredAccount } from "../types";
import { AccountManager } from "../accounts";
import * as quota from "../quota";

const tempDirs = new Set<string>();

function createStoragePath() {
  const baseDir = path.join(os.tmpdir(), `anthropic-accounts-manager-test-${randomUUID()}`);
  tempDirs.add(baseDir);
  return {
    baseDir,
    storagePath: path.join(baseDir, "config", "opencode", "anthropic-accounts.json"),
  };
}

function makeAccount(partial: Partial<StoredAccount>): StoredAccount {
  return {
    refresh: partial.refresh ?? "refresh-default",
    access: partial.access,
    expires: partial.expires,
    addedAt: partial.addedAt ?? Date.now() - 10_000,
    enabled: partial.enabled ?? true,
    email: partial.email,
    label: partial.label,
    lastUsed: partial.lastUsed,
    rateLimitedUntil: partial.rateLimitedUntil,
  };
}

describe("accounts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.clear();
  });

  it("constructor sets accounts and activeIndex", () => {
    const accounts = [makeAccount({ refresh: "r0" }), makeAccount({ refresh: "r1" })];

    const manager = new AccountManager(accounts, 1);

    expect(manager.getActiveIndex()).toBe(1);
    expect(manager.getAllAccounts()).toHaveLength(2);
  });

  it("getActive returns current active account", () => {
    const account0 = makeAccount({ refresh: "r0" });
    const account1 = makeAccount({ refresh: "r1", email: "active@example.com" });
    const manager = new AccountManager([account0, account1], 1);

    expect(manager.getActive()).toEqual(account1);
  });

  it("init loads accounts and selects best active index", async () => {
    const { storagePath } = createStoragePath();
    saveAccounts(
      {
        version: 1,
        activeIndex: 0,
        accounts: [makeAccount({ refresh: "r0" }), makeAccount({ refresh: "r1" })],
      },
      storagePath,
    );
    vi.spyOn(quota, "selectBestAccount").mockResolvedValue(1);

    const manager = await AccountManager.init(storagePath);

    expect(quota.selectBestAccount).toHaveBeenCalledTimes(1);
    expect(manager.getActiveIndex()).toBe(1);
    expect(manager.getActive()?.refresh).toBe("r1");
  });

  it("handleRateLimit marks current account and switches to another", async () => {
    const now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const { storagePath } = createStoragePath();
    const accounts = [
      makeAccount({ refresh: "r0", access: "a0" }),
      makeAccount({ refresh: "r1", access: "a1" }),
    ];
    const manager = new AccountManager(accounts, 0, storagePath);
    vi.spyOn(quota, "selectBestAccount").mockResolvedValue(1);

    const next = await manager.handleRateLimit(30_000);

    expect(next?.refresh).toBe("r1");
    expect(manager.getActiveIndex()).toBe(1);
    expect(manager.getAllAccounts()[0]?.rateLimitedUntil).toBe(now + 30_000);

    const saved = loadAccounts(storagePath);
    expect(saved.activeIndex).toBe(1);
    expect(saved.accounts[0]?.rateLimitedUntil).toBe(now + 30_000);
  });

  it("handleRateLimit returns null when all accounts exhausted", async () => {
    const now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const { storagePath } = createStoragePath();
    const manager = new AccountManager(
      [makeAccount({ refresh: "r0" }), makeAccount({ refresh: "r1" })],
      0,
      storagePath,
    );
    vi.spyOn(quota, "selectBestAccount").mockResolvedValue(0);

    const next = await manager.handleRateLimit(60_000);

    expect(next).toBeNull();
    expect(manager.getActiveIndex()).toBe(0);
  });

  it("markUsed updates lastUsed timestamp", () => {
    const now = 1_700_000_123_456;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const { storagePath } = createStoragePath();
    const manager = new AccountManager([makeAccount({ refresh: "r0" })], 0, storagePath);

    manager.markUsed();

    expect(manager.getAllAccounts()[0]?.lastUsed).toBe(now);
    const saved = loadAccounts(storagePath);
    expect(saved.accounts[0]?.lastUsed).toBe(now);
  });

  it("getShortestWait returns correct wait time", () => {
    const now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const manager = new AccountManager(
      [
        makeAccount({ refresh: "r0", rateLimitedUntil: now + 40_000 }),
        makeAccount({ refresh: "r1", rateLimitedUntil: now + 10_000 }),
        makeAccount({ refresh: "r2" }),
      ],
      2,
    );

    expect(manager.getShortestWait()).toBe(10_000);
  });

  it("getShortestWait returns null when no accounts are rate-limited", () => {
    const manager = new AccountManager([makeAccount({ refresh: "r0" })], 0);

    expect(manager.getShortestWait()).toBeNull();
  });
});
