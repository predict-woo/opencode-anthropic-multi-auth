import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnthropicMultiAuthPlugin } from "../index";
import { saveAccounts } from "../storage";
import type { StoredAccount } from "../types";
import * as quota from "../quota";
import * as oauth from "../oauth";
import * as storage from "../storage";

const tempDirs = new Set<string>();

function createTempStoragePath() {
  const baseDir = path.join(os.tmpdir(), `anthropic-integration-test-${randomUUID()}`);
  tempDirs.add(baseDir);
  return path.join(baseDir, "config", "opencode", "anthropic-accounts.json");
}

function makeAccount(partial: Partial<StoredAccount> = {}): StoredAccount {
  return {
    refresh: partial.refresh ?? `refresh-${randomUUID()}`,
    access: partial.access ?? `access-${randomUUID()}`,
    expires: partial.expires ?? Date.now() + 3_600_000,
    addedAt: partial.addedAt ?? Date.now() - 10_000,
    enabled: partial.enabled ?? true,
    email: partial.email,
    label: partial.label,
    lastUsed: partial.lastUsed,
    rateLimitedUntil: partial.rateLimitedUntil,
  };
}

function makeClient() {
  return {
    auth: {
      set: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe("integration", () => {
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

  it("exports a function matching Plugin type", () => {
    expect(typeof AnthropicMultiAuthPlugin).toBe("function");
  });

  it("returns hooks with auth provider 'anthropic'", async () => {
    const client = makeClient();
    const hooks = await AnthropicMultiAuthPlugin({ client } as any);
    expect(hooks).toBeDefined();
    expect((hooks as any).auth.provider).toBe("anthropic");
  });

  it("returns system transform hook", async () => {
    const client = makeClient();
    const hooks = await AnthropicMultiAuthPlugin({ client } as any);
    const transform = (hooks as any)["experimental.chat.system.transform"];
    expect(typeof transform).toBe("function");

    const input = { model: { providerID: "anthropic" } };
    const output = { system: ["Hello"] };
    transform(input, output);

    expect(output.system[0]).toBe("You are Claude Code, Anthropic's official CLI for Claude.");
    expect(output.system[1]).toBe("You are Claude Code, Anthropic's official CLI for Claude.\n\nHello");
  });

  it("returns three auth methods", async () => {
    const client = makeClient();
    const hooks = await AnthropicMultiAuthPlugin({ client } as any);
    const methods = (hooks as any).auth.methods;
    expect(methods).toHaveLength(3);
    expect(methods[0].label).toBe("Claude Pro/Max");
    expect(methods[0].type).toBe("oauth");
    expect(methods[1].label).toBe("View Account Usage");
    expect(methods[1].type).toBe("oauth");
    expect(methods[2].label).toBe("Manage Accounts");
    expect(methods[2].type).toBe("oauth");
  });

  it("uses auto OAuth flow for non-login menu actions", async () => {
    const account = makeAccount({ refresh: "r1", access: "a1", expires: Date.now() + 3_600_000 });
    vi.spyOn(storage, "loadAccounts").mockReturnValue({
      version: 1,
      accounts: [account],
      activeIndex: 0,
    });
    vi.spyOn(quota, "fetchQuota").mockResolvedValue({
      five_hour: { utilization: 0.12 },
    });

    vi.spyOn(readline, "createInterface").mockReturnValue({
      question(_prompt: string, callback: (answer: string) => void) {
        callback("");
      },
      close() {},
    } as any);

    const client = makeClient();
    const hooks = await AnthropicMultiAuthPlugin({ client } as any);
    const methods = (hooks as any).auth.methods;

    const usageAuth = await methods[1].authorize();
    expect(usageAuth.method).toBe("auto");
    await expect(usageAuth.callback()).resolves.toEqual(
      expect.objectContaining({
        type: "success",
        refresh: "r1",
        access: "a1",
      }),
    );

    const manageAuth = await methods[2].authorize();
    expect(manageAuth.method).toBe("auto");
    await expect(manageAuth.callback()).resolves.toEqual(
      expect.objectContaining({
        type: "success",
        refresh: "r1",
        access: "a1",
      }),
    );
  });

  describe("loader", () => {
    it("returns {} when no accounts configured", async () => {
      const storagePath = createTempStoragePath();
      vi.spyOn(storage, "loadAccounts").mockReturnValue({
        version: 1,
        accounts: [],
        activeIndex: 0,
      });
      vi.spyOn(storage, "importFromAuthJson").mockReturnValue(null);

      const client = makeClient();
      const hooks = await AnthropicMultiAuthPlugin({ client } as any);
      const loader = (hooks as any).auth.loader;
      const result = await loader(vi.fn(), { models: {} });

      expect(result).toEqual({});
    });

    it("returns custom fetch when accounts exist", async () => {
      const account = makeAccount({ refresh: "r1", access: "a1", expires: Date.now() + 3_600_000 });
      vi.spyOn(storage, "loadAccounts").mockReturnValue({
        version: 1,
        accounts: [account],
        activeIndex: 0,
      });
      vi.spyOn(quota, "selectBestAccount").mockResolvedValue(0);
      vi.spyOn(storage, "saveAccounts").mockImplementation(() => {});

      const client = makeClient();
      const hooks = await AnthropicMultiAuthPlugin({ client } as any);
      const loader = (hooks as any).auth.loader;
      const result = await loader(vi.fn(), { models: {} });

      expect(result.apiKey).toBe("");
      expect(typeof result.fetch).toBe("function");
    });

    it("zeros out model costs", async () => {
      const account = makeAccount();
      vi.spyOn(storage, "loadAccounts").mockReturnValue({
        version: 1,
        accounts: [account],
        activeIndex: 0,
      });
      vi.spyOn(quota, "selectBestAccount").mockResolvedValue(0);
      vi.spyOn(storage, "saveAccounts").mockImplementation(() => {});

      const models = {
        "claude-4-opus": { cost: { input: 15, output: 75, cache: { read: 1, write: 2 } } },
      };

      const client = makeClient();
      const hooks = await AnthropicMultiAuthPlugin({ client } as any);
      const loader = (hooks as any).auth.loader;
      await loader(vi.fn(), { models });

      expect(models["claude-4-opus"].cost).toEqual({
        input: 0,
        output: 0,
        cache: { read: 0, write: 0 },
      });
    });

    it("attempts first-time migration from auth.json", async () => {
      const loadSpy = vi.spyOn(storage, "loadAccounts");
      loadSpy.mockReturnValueOnce({ version: 1, accounts: [], activeIndex: 0 });

      const migrated = makeAccount({ refresh: "migrated-refresh" });
      vi.spyOn(storage, "importFromAuthJson").mockReturnValue(migrated);
      vi.spyOn(storage, "addAccount").mockReturnValue({
        version: 1,
        accounts: [migrated],
        activeIndex: 0,
      });

      loadSpy.mockReturnValueOnce({ version: 1, accounts: [migrated], activeIndex: 0 });

      vi.spyOn(quota, "selectBestAccount").mockResolvedValue(0);
      vi.spyOn(storage, "saveAccounts").mockImplementation(() => {});

      const client = makeClient();
      const hooks = await AnthropicMultiAuthPlugin({ client } as any);
      const loader = (hooks as any).auth.loader;
      const result = await loader(vi.fn(), { models: {} });

      expect(storage.importFromAuthJson).toHaveBeenCalled();
      expect(storage.addAccount).toHaveBeenCalledWith(migrated);
      expect(typeof result.fetch).toBe("function");
    });
  });

  describe("custom fetch", () => {
    const originalFetch = globalThis.fetch;
    let fetchSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy as unknown as typeof fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    async function setupLoaderWithAccounts(accounts: StoredAccount[]) {
      vi.spyOn(storage, "loadAccounts").mockReturnValue({
        version: 1,
        accounts: accounts.map((a) => ({ ...a })),
        activeIndex: 0,
      });
      vi.spyOn(quota, "selectBestAccount").mockResolvedValue(0);
      vi.spyOn(storage, "saveAccounts").mockImplementation(() => {});

      const client = makeClient();
      const hooks = await AnthropicMultiAuthPlugin({ client } as any);
      const loader = (hooks as any).auth.loader;
      const result = await loader(vi.fn(), { models: {} });
      return { customFetch: result.fetch, client };
    }

    it("adds Bearer token and transforms request", async () => {
      const account = makeAccount({ access: "test-access-token", expires: Date.now() + 3_600_000 });
      const { customFetch } = await setupLoaderWithAccounts([account]);

      const body = JSON.stringify({ messages: [], model: "claude-4-opus" });
      fetchSpy.mockResolvedValue(new Response("ok", { status: 200 }));

      await customFetch("https://api.anthropic.com/v1/messages", { body, headers: {} });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [, callInit] = fetchSpy.mock.calls[0];
      const headers = callInit.headers as Headers;
      expect(headers.get("authorization")).toBe("Bearer test-access-token");
      expect(headers.get("user-agent")).toContain("claude-cli");
      expect(headers.has("x-api-key")).toBe(false);
    });

    it("refreshes token when expired and syncs auth.json", async () => {
      const account = makeAccount({
        refresh: "old-refresh",
        access: "expired-access",
        expires: Date.now() - 1000,
      });
      const { customFetch, client } = await setupLoaderWithAccounts([account]);

      vi.spyOn(oauth, "refreshToken").mockResolvedValue({
        refresh: "new-refresh",
        access: "new-access",
        expires: Date.now() + 3_600_000,
      });

      fetchSpy.mockResolvedValue(new Response("ok", { status: 200 }));

      await customFetch("https://api.anthropic.com/v1/messages", {
        body: JSON.stringify({ model: "test" }),
        headers: {},
      });

      expect(oauth.refreshToken).toHaveBeenCalledWith("old-refresh");
      expect(client.auth.set).toHaveBeenCalledWith({
        path: { id: "anthropic" },
        body: expect.objectContaining({
          type: "oauth",
          refresh: "new-refresh",
          access: "new-access",
        }),
      });
    });

    it("handles 429 by switching accounts and retrying", async () => {
      const account0 = makeAccount({ refresh: "r0", access: "a0", expires: Date.now() + 3_600_000 });
      const account1 = makeAccount({ refresh: "r1", access: "a1", expires: Date.now() + 3_600_000 });

      vi.spyOn(storage, "loadAccounts").mockReturnValue({
        version: 1,
        accounts: [{ ...account0 }, { ...account1 }],
        activeIndex: 0,
      });
      const selectSpy = vi.spyOn(quota, "selectBestAccount");
      selectSpy.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
      vi.spyOn(storage, "saveAccounts").mockImplementation(() => {});

      const client = makeClient();
      const hooks = await AnthropicMultiAuthPlugin({ client } as any);
      const loader = (hooks as any).auth.loader;
      const result = await loader(vi.fn(), { models: {} });

      const rateLimitResponse = new Response("rate limited", {
        status: 429,
        headers: { "retry-after": "30" },
      });
      const successResponse = new Response("ok", { status: 200 });
      fetchSpy.mockResolvedValueOnce(rateLimitResponse).mockResolvedValueOnce(successResponse);

      const response = await result.fetch("https://api.anthropic.com/v1/messages", {
        body: JSON.stringify({ model: "test" }),
        headers: {},
      });

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(response.status).toBe(200);
    });

    it("throws descriptive error when all accounts exhausted on 429", async () => {
      const account = makeAccount({ refresh: "r0", access: "a0", expires: Date.now() + 3_600_000 });

      vi.spyOn(storage, "loadAccounts").mockReturnValue({
        version: 1,
        accounts: [{ ...account }],
        activeIndex: 0,
      });
      // First call: init selection; second call: handleRateLimit
      const selectSpy = vi.spyOn(quota, "selectBestAccount");
      selectSpy.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      vi.spyOn(storage, "saveAccounts").mockImplementation(() => {});

      const client = makeClient();
      const hooks = await AnthropicMultiAuthPlugin({ client } as any);
      const loader = (hooks as any).auth.loader;
      const result = await loader(vi.fn(), { models: {} });

      const rateLimitResponse = new Response("rate limited", {
        status: 429,
        headers: { "retry-after": "60" },
      });
      fetchSpy.mockResolvedValue(rateLimitResponse);

      await expect(
        result.fetch("https://api.anthropic.com/v1/messages", {
          body: JSON.stringify({ model: "test" }),
          headers: {},
        }),
      ).rejects.toThrow(/All accounts rate-limited/);
    });

    it("transforms streaming response by stripping mcp_ prefix", async () => {
      const account = makeAccount({ access: "a0", expires: Date.now() + 3_600_000 });
      const { customFetch } = await setupLoaderWithAccounts([account]);

      const streamData = 'data: {"type":"content_block_start","content_block":{"type":"tool_use","name":"mcp_read_file"}}\n\n';
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(streamData));
          controller.close();
        },
      });

      fetchSpy.mockResolvedValue(
        new Response(readable, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
      );

      const response = await customFetch("https://api.anthropic.com/v1/messages", {
        body: JSON.stringify({ model: "test" }),
        headers: {},
      });

      const reader = response.body!.getReader();
      const { value } = await reader.read();
      const text = new TextDecoder().decode(value);

      expect(text).toContain('"name": "read_file"');
      expect(text).not.toContain("mcp_read_file");
    });

    it("transforms request URL by adding beta param", async () => {
      const account = makeAccount({ access: "a0", expires: Date.now() + 3_600_000 });
      const { customFetch } = await setupLoaderWithAccounts([account]);

      fetchSpy.mockResolvedValue(new Response("ok", { status: 200 }));

      await customFetch("https://api.anthropic.com/v1/messages", {
        body: JSON.stringify({ model: "test" }),
        headers: {},
      });

      const [calledUrl] = fetchSpy.mock.calls[0];
      expect(calledUrl.toString()).toContain("beta=true");
    });

    it("transforms request body by prefixing tool names", async () => {
      const account = makeAccount({ access: "a0", expires: Date.now() + 3_600_000 });
      const { customFetch } = await setupLoaderWithAccounts([account]);

      fetchSpy.mockResolvedValue(new Response("ok", { status: 200 }));

      const body = JSON.stringify({
        model: "test",
        tools: [{ name: "read_file", description: "Read a file" }],
      });

      await customFetch("https://api.anthropic.com/v1/messages", { body, headers: {} });

      const [, callInit] = fetchSpy.mock.calls[0];
      const parsedBody = JSON.parse(callInit.body);
      expect(parsedBody.tools[0].name).toBe("mcp_read_file");
    });
  });
});
