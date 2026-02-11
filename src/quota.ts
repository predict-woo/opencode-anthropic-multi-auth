import { refreshAllAccounts } from "./oauth";
import type { QuotaResponse, StoredAccount } from "./types";

const USAGE_ENDPOINT = "https://api.anthropic.com/api/oauth/usage";
const REQUEST_TIMEOUT_MS = 10_000;

function getUtilization(quota: QuotaResponse): number | null {
  if (typeof quota.five_hour?.utilization === "number") {
    return quota.five_hour.utilization;
  }

  if (typeof quota.seven_day?.utilization === "number") {
    return quota.seven_day.utilization;
  }

  return null;
}

function pickRoundRobinIndex(accounts: StoredAccount[], eligibleIndexes: number[]): number {
  const firstUnused = eligibleIndexes.find((index) => accounts[index]?.lastUsed === undefined);
  if (firstUnused !== undefined) {
    return firstUnused;
  }

  let selected = eligibleIndexes[0] ?? 0;
  let oldestLastUsed = Number.POSITIVE_INFINITY;

  for (const index of eligibleIndexes) {
    const lastUsed = accounts[index]?.lastUsed ?? Number.POSITIVE_INFINITY;
    if (lastUsed < oldestLastUsed) {
      oldestLastUsed = lastUsed;
      selected = index;
    }
  }

  return selected;
}

export async function fetchQuota(accessToken: string): Promise<QuotaResponse | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(USAGE_ENDPOINT, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "oauth-2025-04-20",
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as QuotaResponse;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function selectBestAccount(
  accounts: StoredAccount[],
  storagePath?: string,
): Promise<number> {
  if (accounts.length === 0) {
    return 0;
  }

  let refreshedAccounts = accounts;
  if (storagePath !== undefined) {
    try {
      refreshedAccounts = await refreshAllAccounts(accounts, 0, storagePath);
    } catch {
      refreshedAccounts = accounts;
    }
  }

  const now = Date.now();
  const eligibleIndexes: number[] = [];
  for (let i = 0; i < refreshedAccounts.length; i += 1) {
    const account = refreshedAccounts[i];
    if (!account || account.enabled === false) {
      continue;
    }
    if (typeof account.rateLimitedUntil === "number" && account.rateLimitedUntil > now) {
      continue;
    }
    eligibleIndexes.push(i);
  }

  if (eligibleIndexes.length === 0) {
    return 0;
  }

  const checks = await Promise.allSettled(
    eligibleIndexes.map(async (index) => {
      const account = refreshedAccounts[index];
      if (!account?.access) {
        return null;
      }

      const quota = await fetchQuota(account.access);
      if (!quota) {
        return null;
      }

      const utilization = getUtilization(quota);
      if (utilization === null) {
        return null;
      }

      return {
        index,
        utilization,
      };
    }),
  );

  const successful = checks
    .filter((result): result is PromiseFulfilledResult<{ index: number; utilization: number } | null> => {
      return result.status === "fulfilled";
    })
    .map((result) => result.value)
    .filter((value): value is { index: number; utilization: number } => value !== null);

  if (successful.length > 0) {
    successful.sort((a, b) => {
      if (a.utilization !== b.utilization) {
        return a.utilization - b.utilization;
      }

      const aLastUsed = refreshedAccounts[a.index]?.lastUsed ?? Number.NEGATIVE_INFINITY;
      const bLastUsed = refreshedAccounts[b.index]?.lastUsed ?? Number.NEGATIVE_INFINITY;
      return aLastUsed - bLastUsed;
    });
    return successful[0]?.index ?? 0;
  }

  return pickRoundRobinIndex(refreshedAccounts, eligibleIndexes);
}
