import readline from "node:readline";
import path from "node:path";
import os from "node:os";
import type { Plugin } from "@opencode-ai/plugin";
import { AccountManager } from "./accounts";
import { authorize, exchange, refreshToken } from "./oauth";
import { fetchQuota } from "./quota";
import { addAccount, importFromAuthJson, loadAccounts, removeAccount, saveAccounts } from "./storage";
import { createSystemTransformHook, transformRequestBody, transformStreamChunk, buildRequestHeaders, transformRequestUrl } from "./transform";
import type { QuotaResponse, StoredAccount } from "./types";

function askQuestion(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

function getAuthJsonPath(): string {
  return path.join(os.homedir(), ".config", "opencode", "auth.json");
}

function getQuotaUtilization(quota: QuotaResponse): number | null {
  if (typeof quota.five_hour?.utilization === "number") {
    return quota.five_hour.utilization;
  }

  if (typeof quota.seven_day?.utilization === "number") {
    return quota.seven_day.utilization;
  }

  return null;
}

function formatUtilization(utilization: number): string {
  const percent = utilization <= 1 ? utilization * 100 : utilization;
  return `${percent.toFixed(1)}%`;
}

function wrapStreamingResponse(response: Response): Response {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }

      let text = decoder.decode(value, { stream: true });
      text = transformStreamChunk(text);
      controller.enqueue(encoder.encode(text));
    },
  });

  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export const AnthropicMultiAuthPlugin: Plugin = async ({ client }) => {
  const authClient = client as any;

  async function getExistingOAuthResult() {
    const data = loadAccounts();
    const active = data.accounts[data.activeIndex] ?? data.accounts[0];
    if (!active) {
      return { type: "failed" as const };
    }

    let refresh = active.refresh;
    let access = active.access;
    let expires = active.expires;

    if (!access || !expires || expires < Date.now()) {
      try {
        const refreshed = await refreshToken(refresh);
        refresh = refreshed.refresh;
        access = refreshed.access;
        expires = refreshed.expires;

        active.refresh = refreshed.refresh;
        active.access = refreshed.access;
        active.expires = refreshed.expires;

        saveAccounts({
          version: 1,
          accounts: data.accounts,
          activeIndex: data.activeIndex,
        });
      } catch {
        return { type: "failed" as const };
      }
    }

    return {
      type: "success" as const,
      refresh,
      access,
      expires,
    };
  }

  return ({
    "experimental.chat.system.transform": createSystemTransformHook(),
    auth: {
      provider: "anthropic",
      async loader(_getAuth: () => Promise<any>, provider: any) {
        // Load accounts from storage
        let data = loadAccounts();

        // First-time migration: import from auth.json if no accounts exist
        if (data.accounts.length === 0) {
          const authJsonPath = getAuthJsonPath();
          const migrated = importFromAuthJson(authJsonPath);
          if (migrated) {
            addAccount(migrated);
            data = loadAccounts();
          }
        }

        // Empty accounts fallback — let builtin plugin work
        if (data.accounts.length === 0) {
          return {};
        }

        // Initialize AccountManager (selects best account via quota)
        const accountManager = await AccountManager.init();

        // Mark active account as used
        accountManager.markUsed();

        // Zero out model costs for Pro/Max plan
        for (const model of Object.values(provider.models)) {
          (model as any).cost = {
            input: 0,
            output: 0,
            cache: {
              read: 0,
              write: 0,
            },
          };
        }

        return {
          apiKey: "",
          async fetch(input: string | URL | Request, init?: RequestInit) {
            const active = accountManager.getActive();
            if (!active) {
              return fetch(input, init);
            }

            // Refresh token if expired
            let accessToken = active.access;
            if (!accessToken || !active.expires || active.expires < Date.now()) {
              const refreshed = await refreshToken(active.refresh);
              active.refresh = refreshed.refresh;
              active.access = refreshed.access;
              active.expires = refreshed.expires;
              accessToken = refreshed.access;

              // Persist refreshed credentials
              saveAccounts({
                version: 1,
                accounts: accountManager.getAllAccounts(),
                activeIndex: accountManager.getActiveIndex(),
              });

              // Sync auth.json
              await authClient.auth.set({
                path: { id: "anthropic" },
                body: {
                  type: "oauth",
                  refresh: refreshed.refresh,
                  access: refreshed.access,
                  expires: refreshed.expires,
                },
              });
            }

            // Transform request
            const transformedUrl = transformRequestUrl(input);
            const transformedBody = transformRequestBody(init?.body as string | null | undefined);

            // Build auth headers
            const originalHeaders = new Headers();
            if (input instanceof Request) {
              input.headers.forEach((value, key) => {
                originalHeaders.set(key, value);
              });
            }
            if (init?.headers) {
              if (init.headers instanceof Headers) {
                init.headers.forEach((value, key) => {
                  originalHeaders.set(key, value);
                });
              } else if (Array.isArray(init.headers)) {
                for (const [key, value] of init.headers) {
                  if (typeof value !== "undefined") {
                    originalHeaders.set(key, String(value));
                  }
                }
              } else {
                for (const [key, value] of Object.entries(init.headers)) {
                  if (typeof value !== "undefined") {
                    originalHeaders.set(key, String(value));
                  }
                }
              }
            }

            const requestHeaders = buildRequestHeaders(accessToken!, originalHeaders);

            // Make the actual fetch call
            const response = await fetch(transformedUrl, {
              ...init,
              body: transformedBody,
              headers: requestHeaders,
            });

            // Handle 429 rate limit
            if (response.status === 429) {
              const retryAfterHeader = response.headers.get("retry-after");
              const retryAfterMs = retryAfterHeader
                ? Number.parseFloat(retryAfterHeader) * 1000
                : 60_000;

              const nextAccount = await accountManager.handleRateLimit(retryAfterMs);

              if (nextAccount) {
                // Retry with new account
                let nextAccessToken = nextAccount.access;
                if (!nextAccessToken || !nextAccount.expires || nextAccount.expires < Date.now()) {
                  const refreshed = await refreshToken(nextAccount.refresh);
                  nextAccount.refresh = refreshed.refresh;
                  nextAccount.access = refreshed.access;
                  nextAccount.expires = refreshed.expires;
                  nextAccessToken = refreshed.access;

                  saveAccounts({
                    version: 1,
                    accounts: accountManager.getAllAccounts(),
                    activeIndex: accountManager.getActiveIndex(),
                  });

                  await authClient.auth.set({
                    path: { id: "anthropic" },
                    body: {
                      type: "oauth",
                      refresh: refreshed.refresh,
                      access: refreshed.access,
                      expires: refreshed.expires,
                    },
                  });
                }

                const retryHeaders = buildRequestHeaders(nextAccessToken!, originalHeaders);
                const retryResponse = await fetch(transformedUrl, {
                  ...init,
                  body: transformedBody,
                  headers: retryHeaders,
                });

                // Transform streaming retry response
                if (retryResponse.body) {
                  return wrapStreamingResponse(retryResponse);
                }
                return retryResponse;
              }

              // All accounts exhausted
              const shortestWait = accountManager.getShortestWait();
              const waitMsg = shortestWait !== null
                ? ` Shortest wait: ${Math.ceil(shortestWait / 1000)}s.`
                : "";
              throw new Error(
                `All accounts rate-limited.${waitMsg} Try again later.`,
              );
            }

            // Transform streaming response
            if (response.body) {
              return wrapStreamingResponse(response);
            }

            return response;
          },
        };
      },
      methods: [
        {
          type: "oauth" as const,
          label: "Claude Pro/Max",
          async authorize() {
            const { url, verifier } = await authorize("max");
            return {
              url,
              instructions: "Paste the authorization code here: ",
              method: "code" as const,
              async callback(code: string) {
                const result = await exchange(code, verifier);
                if (result.type === "failed") {
                  return { type: "failed" as const };
                }

                // Store the account
                const account: StoredAccount = {
                  refresh: result.refresh,
                  access: result.access,
                  expires: result.expires,
                  addedAt: Date.now(),
                  enabled: true,
                };
                addAccount(account);
                let accountCount = 1;

                // Latest creds for return
                let lastResult = result;

                // Multi-account loop inside callback
                const rl = readline.createInterface({
                  input: process.stdin,
                  output: process.stdout,
                });

                try {
                  while (true) {
                    const answer = await askQuestion(
                      rl,
                      `Add another account? (${accountCount} added) (y/n) `,
                    );

                    if (answer.toLowerCase() !== "y" && answer.toLowerCase() !== "yes") {
                      break;
                    }

                    // Fresh PKCE for the new account
                    const nextAuth = await authorize("max");
                    console.log(`\nAuthorize at: ${nextAuth.url}\n`);

                    const nextCode = await askQuestion(rl, "Paste the authorization code: ");
                    const nextResult = await exchange(nextCode, nextAuth.verifier);

                    if (nextResult.type === "failed") {
                      console.log("Failed to exchange code. Skipping.\n");
                      continue;
                    }

                    const nextAccount: StoredAccount = {
                      refresh: nextResult.refresh,
                      access: nextResult.access,
                      expires: nextResult.expires,
                      addedAt: Date.now(),
                      enabled: true,
                    };
                    addAccount(nextAccount);
                    accountCount += 1;
                    lastResult = nextResult;
                  }
                } finally {
                  rl.close();
                }

                // Sync auth.json for active account
                await authClient.auth.set({
                  path: { id: "anthropic" },
                  body: {
                    type: "oauth",
                    refresh: lastResult.refresh,
                    access: lastResult.access,
                    expires: lastResult.expires,
                  },
                });

                return {
                  type: "success" as const,
                  refresh: lastResult.refresh,
                  access: lastResult.access,
                  expires: lastResult.expires,
                };
              },
            };
          },
        },
        {
          type: "oauth" as const,
          label: "View Account Usage",
          async authorize() {
            const data = loadAccounts();

            if (data.accounts.length === 0) {
              console.log("\nNo accounts configured.\n");
            } else {
              let didUpdateAccounts = false;
              console.log("\nAccount usage:");
              for (let i = 0; i < data.accounts.length; i += 1) {
                const account = data.accounts[i]!;
                const label = account.label || account.email || `Account ${i + 1}`;
                const status = account.enabled ? "enabled" : "disabled";
                const active = i === data.activeIndex ? " (active)" : "";

                let accessToken = account.access;
                if (!accessToken || !account.expires || account.expires < Date.now()) {
                  try {
                    const refreshed = await refreshToken(account.refresh);
                    account.refresh = refreshed.refresh;
                    account.access = refreshed.access;
                    account.expires = refreshed.expires;
                    accessToken = refreshed.access;
                    didUpdateAccounts = true;
                  } catch {
                    accessToken = undefined;
                  }
                }

                let usageText = "unavailable";
                if (accessToken) {
                  const quota = await fetchQuota(accessToken);
                  if (quota) {
                    const utilization = getQuotaUtilization(quota);
                    if (utilization !== null) {
                      usageText = formatUtilization(utilization);
                    }
                  }
                }

                console.log(`  ${i + 1}. ${label} [${status}]${active} - ${usageText}`);
              }

              if (didUpdateAccounts) {
                saveAccounts(data);
              }
              console.log();
            }

            return {
              url: "",
              instructions: "",
              method: "auto" as const,
              async callback() {
                return getExistingOAuthResult();
              },
            };
          },
        },
        {
          type: "oauth" as const,
          label: "Manage Accounts",
          async authorize() {
            const rl = readline.createInterface({
              input: process.stdin,
              output: process.stdout,
            });

            try {
              const data = loadAccounts();
              if (data.accounts.length === 0) {
                console.log("\nNo accounts configured.\n");
              } else {
                console.log("\nConfigured accounts:");
                for (let i = 0; i < data.accounts.length; i++) {
                  const acct = data.accounts[i]!;
                  const label = acct.label || acct.email || `Account ${i + 1}`;
                  const status = acct.enabled ? "enabled" : "disabled";
                  const active = i === data.activeIndex ? " (active)" : "";
                  console.log(`  ${i + 1}. ${label} [${status}]${active}`);
                }

                const answer = await askQuestion(
                  rl,
                  "\nEnter account number to remove (or press Enter to cancel): ",
                );

                const index = Number.parseInt(answer, 10) - 1;
                if (!Number.isNaN(index) && index >= 0 && index < data.accounts.length) {
                  removeAccount(index);
                  console.log(`Removed account ${index + 1}.\n`);
                }
              }
            } finally {
              rl.close();
            }

            return {
              url: "",
              instructions: "",
              method: "auto" as const,
              async callback() {
                return getExistingOAuthResult();
              },
            };
          },
        },
      ],
    },
  }) as any;
};

export default AnthropicMultiAuthPlugin;
