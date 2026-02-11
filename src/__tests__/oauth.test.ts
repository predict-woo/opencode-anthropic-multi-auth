import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadAccounts } from "../storage";
import type { StoredAccount } from "../types";
import * as pkce from "@openauthjs/openauth/pkce";
import { authorize, exchange, refreshAllAccounts, refreshToken } from "../oauth";

const tempDirs = new Set<string>();
const originalFetch = globalThis.fetch;

function createStoragePath() {
  const baseDir = path.join(os.tmpdir(), `anthropic-oauth-test-${randomUUID()}`);
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

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("oauth", () => {
  beforeEach(() => {
    vi.spyOn(pkce, "generatePKCE").mockResolvedValue({
      challenge: "challenge-123",
      verifier: "verifier-123",
      method: "S256",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.clear();
  });

  it("authorize(max) generates URL on claude.ai domain", async () => {
    const result = await authorize("max");

    expect(result.url.startsWith("https://claude.ai/oauth/authorize")).toBe(true);
    expect(result.verifier).toBe("verifier-123");
    expect(result.state).toBeTypeOf("string");
  });

  it("authorize(console) generates URL on console.anthropic.com domain", async () => {
    const result = await authorize("console");

    expect(result.url.startsWith("https://console.anthropic.com/oauth/authorize")).toBe(true);
    expect(result.verifier).toBe("verifier-123");
    expect(result.state).toBeTypeOf("string");
  });

  it("authorize URL includes required OAuth and PKCE parameters", async () => {
    const result = await authorize("max");
    const url = new URL(result.url);

    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("9d1c250a-e61b-44d9-88ed-5944d1962f5e");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:19832/oauth/callback");
    expect(url.searchParams.get("scope")).toBe("org:create_api_key user:profile user:inference");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-123");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe(result.state);
  });

  it("exchange calls token endpoint with authorization_code payload", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        refresh_token: "refresh-next",
        access_token: "access-next",
        expires_in: 300,
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await exchange("auth-code#state-abc", "verifier-xyz");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://console.anthropic.com/v1/oauth/token");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(String(init.body))).toEqual({
      code: "auth-code",
      state: "state-abc",
      grant_type: "authorization_code",
      client_id: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
      redirect_uri: "http://localhost:19832/oauth/callback",
      code_verifier: "verifier-xyz",
    });
    nowSpy.mockRestore();
  });

  it("exchange returns success result with absolute expires timestamp", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        refresh_token: "refresh-next",
        access_token: "access-next",
        expires_in: 120,
      }),
    );

    await expect(exchange("auth-code#state-abc", "verifier-xyz")).resolves.toEqual({
      type: "success",
      refresh: "refresh-next",
      access: "access-next",
      expires: 1_700_000_120_000,
    });
  });

  it("exchange returns failed on non-OK response", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { error: "invalid_grant" })) as unknown as typeof fetch;

    await expect(exchange("auth-code#state-abc", "verifier-xyz")).resolves.toEqual({ type: "failed" });
  });

  it("exchange splits callback code#state input correctly", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        refresh_token: "refresh-next",
        access_token: "access-next",
        expires_in: 300,
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await exchange("code-part#state-part", "verifier-xyz");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.code).toBe("code-part");
    expect(body.state).toBe("state-part");
  });

  it("refreshToken posts refresh_token grant body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        refresh_token: "refresh-next",
        access_token: "access-next",
        expires_in: 300,
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await refreshToken("refresh-current");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://console.anthropic.com/v1/oauth/token");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      grant_type: "refresh_token",
      refresh_token: "refresh-current",
      client_id: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
    });
  });

  it("refreshToken returns refreshed access and refresh tokens", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        refresh_token: "refresh-next",
        access_token: "access-next",
        expires_in: 60,
      }),
    );

    await expect(refreshToken("refresh-current")).resolves.toEqual({
      refresh: "refresh-next",
      access: "access-next",
      expires: 1_700_000_060_000,
    });
  });

  it("refreshToken throws descriptive error on failure", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(500, { error: "server_error" })) as unknown as typeof fetch;

    await expect(refreshToken("refresh-current")).rejects.toThrow(
      "Token refresh failed: 500",
    );
  });

  it("refreshAllAccounts refreshes only expired or near-expiry accounts", async () => {
    const now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          refresh_token: "refresh-updated-1",
          access_token: "access-updated-1",
          expires_in: 120,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          refresh_token: "refresh-updated-2",
          access_token: "access-updated-2",
          expires_in: 240,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          refresh_token: "refresh-updated-3",
          access_token: "access-updated-3",
          expires_in: 360,
        }),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { storagePath } = createStoragePath();
    const accounts: StoredAccount[] = [
      makeAccount({ refresh: "refresh-1", access: "access-1", expires: now - 1_000 }),
      makeAccount({ refresh: "refresh-2", access: "access-2", expires: now + 10 * 60_000 }),
      makeAccount({ refresh: "refresh-3", access: "access-3", expires: now + 30_000 }),
      makeAccount({ refresh: "refresh-4", access: "access-4" }),
    ];

    const updated = await refreshAllAccounts(accounts, 1, storagePath);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(updated[0]?.refresh).toBe("refresh-updated-1");
    expect(updated[1]?.refresh).toBe("refresh-2");
    expect(updated[2]?.refresh).toBe("refresh-updated-2");
    expect(updated[3]?.refresh).toBe("refresh-updated-3");

    const persisted = loadAccounts(storagePath);
    expect(persisted.activeIndex).toBe(1);
    expect(persisted.accounts.map((item) => item.refresh)).toEqual([
      "refresh-updated-1",
      "refresh-2",
      "refresh-updated-2",
      "refresh-updated-3",
    ]);
  });

  it("refreshAllAccounts continues when one account refresh fails", async () => {
    const now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, { error: "server_error" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          refresh_token: "refresh-updated-2",
          access_token: "access-updated-2",
          expires_in: 120,
        }),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { storagePath } = createStoragePath();
    const accounts: StoredAccount[] = [
      makeAccount({ refresh: "refresh-1", access: "access-1", expires: now - 1_000 }),
      makeAccount({ refresh: "refresh-2", access: "access-2", expires: now - 1_000 }),
    ];

    const updated = await refreshAllAccounts(accounts, 0, storagePath);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(updated[0]?.refresh).toBe("refresh-1");
    expect(updated[1]?.refresh).toBe("refresh-updated-2");
  });
});
