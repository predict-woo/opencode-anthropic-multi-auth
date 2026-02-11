import crypto from "node:crypto";
import { generatePKCE } from "@openauthjs/openauth/pkce";
import { saveAccounts } from "./storage";
import type { StoredAccount } from "./types";

const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const REDIRECT_URI = "http://localhost:19832/oauth/callback";
const MAX_AUTHORIZE_URL = "https://claude.ai/oauth/authorize";
const CONSOLE_AUTHORIZE_URL = "https://console.anthropic.com/oauth/authorize";
const TOKEN_ENDPOINT = "https://console.anthropic.com/v1/oauth/token";
const SCOPE = "org:create_api_key user:profile user:inference";

type ExchangeResult =
  | { type: "success"; refresh: string; access: string; expires: number }
  | { type: "failed" };

export async function authorize(type: "max" | "console"): Promise<{
  url: string;
  verifier: string;
  state: string;
}> {
  const pkce = await generatePKCE();
  const state = crypto.randomUUID();

  const url = new URL(type === "console" ? CONSOLE_AUTHORIZE_URL : MAX_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", pkce.challenge);
  url.searchParams.set("code_challenge_method", "S256");

  return {
    url: url.toString(),
    verifier: pkce.verifier,
    state,
  };
}

export async function exchange(callbackValue: string, verifier: string): Promise<ExchangeResult> {
  const [code, state] = callbackValue.split("#");

  try {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code,
        state,
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier,
      }),
    });

    if (!response.ok) {
      return { type: "failed" };
    }

    const json = (await response.json()) as {
      refresh_token: string;
      access_token: string;
      expires_in: number;
    };

    return {
      type: "success",
      refresh: json.refresh_token,
      access: json.access_token,
      expires: Date.now() + json.expires_in * 1000,
    };
  } catch {
    return { type: "failed" };
  }
}

export async function refreshToken(
  refreshTokenStr: string,
): Promise<{ refresh: string; access: string; expires: number }> {
  let response: Response;
  try {
    response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: refreshTokenStr,
        client_id: CLIENT_ID,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown fetch error";
    throw new Error(`Token refresh failed: ${message}`);
  }

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  const json = (await response.json()) as {
    refresh_token: string;
    access_token: string;
    expires_in: number;
  };

  return {
    refresh: json.refresh_token,
    access: json.access_token,
    expires: Date.now() + json.expires_in * 1000,
  };
}

export async function refreshAllAccounts(
  accounts: StoredAccount[],
  activeIndex: number,
  storagePath?: string,
): Promise<StoredAccount[]> {
  const refreshBefore = Date.now() + 60_000;
  const updated = accounts.map((account) => ({ ...account }));

  for (let i = 0; i < updated.length; i += 1) {
    const account = updated[i];
    if (!account) {
      continue;
    }

    const shouldRefresh = account.expires === undefined || account.expires < refreshBefore;
    if (!shouldRefresh) {
      continue;
    }

    try {
      const next = await refreshToken(account.refresh);
      account.refresh = next.refresh;
      account.access = next.access;
      account.expires = next.expires;
    } catch (error) {
      console.warn(`Failed to refresh account at index ${i}`, error);
    }
  }

  saveAccounts(
    {
      version: 1,
      accounts: updated,
      activeIndex,
    },
    storagePath,
  );

  return updated;
}
