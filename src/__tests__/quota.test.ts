import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuotaResponse, StoredAccount } from "../types";
import { fetchQuota, selectBestAccount } from "../quota";

const originalFetch = globalThis.fetch;

function makeAccount(partial: Partial<StoredAccount>): StoredAccount {
  return {
    refresh: partial.refresh ?? "refresh-default",
    access: partial.access ?? "access-default",
    expires: partial.expires ?? Date.now() + 60 * 60_000,
    addedAt: partial.addedAt ?? Date.now() - 1_000,
    enabled: partial.enabled ?? true,
    email: partial.email,
    label: partial.label,
    lastUsed: partial.lastUsed,
    rateLimitedUntil: partial.rateLimitedUntil,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("quota", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  it("fetchQuota calls usage API with required headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        five_hour: { utilization: 50, resets_at: "2025-01-15T12:00:00Z" },
        seven_day: { utilization: 20, resets_at: "2025-01-20T00:00:00Z" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await fetchQuota("token-abc");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/api/oauth/usage");
    expect(init.method).toBe("GET");
    expect(init.headers).toEqual({
      Authorization: "Bearer token-abc",
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "oauth-2025-04-20",
      Accept: "application/json",
    });
  });

  it("fetchQuota returns parsed utilization data on success", async () => {
    const payload: QuotaResponse = {
      five_hour: { utilization: 42, resets_at: "2025-01-15T12:00:00Z" },
      seven_day: { utilization: 15, resets_at: "2025-01-20T00:00:00Z" },
    };
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(200, payload)) as unknown as typeof fetch;

    await expect(fetchQuota("token-abc")).resolves.toEqual(payload);
  });

  it("fetchQuota returns null on non-OK response", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(403, { error: "forbidden" })) as unknown as typeof fetch;

    await expect(fetchQuota("token-abc")).resolves.toBeNull();
  });

  it("fetchQuota returns null on network error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

    await expect(fetchQuota("token-abc")).resolves.toBeNull();
  });

  it("fetchQuota returns null on timeout", async () => {
    vi.spyOn(globalThis, "setTimeout").mockImplementation((callback: any) => {
      if (typeof callback === "function") {
        callback();
      }
      return 1 as unknown as ReturnType<typeof setTimeout>;
    });
    globalThis.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise((_, reject) => {
        const signal = init?.signal;
        if (!signal) {
          reject(new Error("missing signal"));
          return;
        }
        if (signal.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        signal.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    }) as unknown as typeof fetch;

    await expect(fetchQuota("token-abc")).resolves.toBeNull();
  });

  it("selectBestAccount picks account with lowest seven_day utilization when available", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          five_hour: { utilization: 10 },
          seven_day: { utilization: 80 },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          five_hour: { utilization: 90 },
          seven_day: { utilization: 20 },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          five_hour: { utilization: 5 },
          seven_day: { utilization: 60 },
        }),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const accounts = [
      makeAccount({ refresh: "r0", access: "a0" }),
      makeAccount({ refresh: "r1", access: "a1" }),
      makeAccount({ refresh: "r2", access: "a2" }),
    ];

    await expect(selectBestAccount(accounts)).resolves.toBe(1);
  });

  it("selectBestAccount falls back to five_hour utilization when seven_day is missing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { five_hour: { utilization: 80 } }))
      .mockResolvedValueOnce(jsonResponse(200, { five_hour: { utilization: 20 } }))
      .mockResolvedValueOnce(jsonResponse(200, { five_hour: { utilization: 60 } }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const accounts = [
      makeAccount({ refresh: "r0", access: "a0" }),
      makeAccount({ refresh: "r1", access: "a1" }),
      makeAccount({ refresh: "r2", access: "a2" }),
    ];

    await expect(selectBestAccount(accounts)).resolves.toBe(1);
  });

  it("selectBestAccount skips disabled and rate-limited accounts", async () => {
    const now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { five_hour: { utilization: 80 } }))
      .mockResolvedValueOnce(jsonResponse(200, { five_hour: { utilization: 10 } }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const accounts = [
      makeAccount({ refresh: "r0", access: "a0", rateLimitedUntil: now + 60_000 }),
      makeAccount({ refresh: "r1", access: "a1", enabled: false }),
      makeAccount({ refresh: "r2", access: "a2" }),
      makeAccount({ refresh: "r3", access: "a3" }),
    ];

    await expect(selectBestAccount(accounts)).resolves.toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("selectBestAccount falls back to round-robin when all quota checks fail", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("usage api down")) as unknown as typeof fetch;

    const accounts = [
      makeAccount({ refresh: "r0", access: "a0", lastUsed: 3_000 }),
      makeAccount({ refresh: "r1", access: "a1", lastUsed: 1_000 }),
      makeAccount({ refresh: "r2", access: "a2", lastUsed: 2_000 }),
    ];

    await expect(selectBestAccount(accounts)).resolves.toBe(1);
  });

  it("selectBestAccount returns 0 when no accounts are available", async () => {
    await expect(selectBestAccount([])).resolves.toBe(0);
  });
});
