import { selectBestAccount } from "./quota";
import { loadAccounts, saveAccounts } from "./storage";
import type { StoredAccount } from "./types";

export class AccountManager {
  private accounts: StoredAccount[];
  private activeIndex: number;
  private storagePath?: string;

  constructor(accounts: StoredAccount[], activeIndex: number, storagePath?: string) {
    this.accounts = accounts.map((account) => ({ ...account }));
    this.activeIndex = this.normalizeActiveIndex(activeIndex);
    this.storagePath = storagePath;
  }

  static async init(storagePath?: string): Promise<AccountManager> {
    const data = loadAccounts(storagePath);
    const activeIndex = await selectBestAccount(data.accounts, storagePath);
    const manager = new AccountManager(data.accounts, activeIndex, storagePath);
    manager.persist();
    return manager;
  }

  getActive(): StoredAccount | undefined {
    return this.accounts[this.activeIndex];
  }

  getActiveIndex(): number {
    return this.activeIndex;
  }

  getAllAccounts(): StoredAccount[] {
    return this.accounts;
  }

  async handleRateLimit(retryAfterMs: number): Promise<StoredAccount | null> {
    const current = this.getActive();
    if (!current) {
      return null;
    }

    current.rateLimitedUntil = Date.now() + Math.max(0, retryAfterMs);
    this.persist();

    const availableIndexes = this.getAvailableIndexes();
    if (availableIndexes.length === 0) {
      return null;
    }

    const nextIndex = await selectBestAccount(this.accounts, this.storagePath);
    if (!availableIndexes.includes(nextIndex)) {
      return null;
    }

    this.activeIndex = nextIndex;
    this.persist();
    return this.getActive() ?? null;
  }

  markUsed(): void {
    const current = this.getActive();
    if (!current) {
      return;
    }

    current.lastUsed = Date.now();
    this.persist();
  }

  getShortestWait(): number | null {
    const now = Date.now();
    let shortest = Number.POSITIVE_INFINITY;

    for (const account of this.accounts) {
      if (typeof account.rateLimitedUntil !== "number") {
        continue;
      }
      if (account.rateLimitedUntil <= now) {
        continue;
      }

      shortest = Math.min(shortest, account.rateLimitedUntil - now);
    }

    return Number.isFinite(shortest) ? shortest : null;
  }

  private normalizeActiveIndex(index: number): number {
    if (this.accounts.length === 0) {
      return 0;
    }

    return Math.min(Math.max(0, Math.trunc(index)), this.accounts.length - 1);
  }

  private getAvailableIndexes(): number[] {
    const now = Date.now();
    const indexes: number[] = [];

    for (let i = 0; i < this.accounts.length; i += 1) {
      const account = this.accounts[i];
      if (!account || account.enabled === false) {
        continue;
      }
      if (typeof account.rateLimitedUntil === "number" && account.rateLimitedUntil > now) {
        continue;
      }
      indexes.push(i);
    }

    return indexes;
  }

  private persist(): void {
    saveAccounts(
      {
        version: 1,
        accounts: this.accounts,
        activeIndex: this.normalizeActiveIndex(this.activeIndex),
      },
      this.storagePath,
    );
  }
}
