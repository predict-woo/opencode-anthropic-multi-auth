export interface StoredAccount {
  email?: string;
  refresh: string;
  access?: string;
  expires?: number;
  addedAt: number;
  lastUsed?: number;
  label?: string;
  rateLimitedUntil?: number;
  enabled: boolean;
}

export interface AccountStorage {
  version: 1;
  accounts: StoredAccount[];
  activeIndex: number;
}

export interface QuotaResponse {
  five_hour?: { utilization: number; resets_at?: string };
  seven_day?: { utilization: number; resets_at?: string };
}
