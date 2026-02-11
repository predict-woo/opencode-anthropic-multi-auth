import { describe, expect, it } from "vitest";
import {
  buildRequestHeaders,
  createSystemTransformHook,
  transformRequestBody,
  transformRequestUrl,
  transformStreamChunk,
} from "../transform";

describe("transform", () => {
  it("transformRequestBody prefixes tool names in tools array", () => {
    const body = JSON.stringify({
      tools: [{ name: "bash", description: "run shell" }, { name: "read" }],
    });

    const transformed = JSON.parse(transformRequestBody(body));
    expect(transformed.tools[0].name).toBe("mcp_bash");
    expect(transformed.tools[1].name).toBe("mcp_read");
  });

  it("transformRequestBody prefixes tool_use names in message blocks", () => {
    const body = JSON.stringify({
      messages: [
        {
          role: "assistant",
          content: [
            { type: "text", text: "will run" },
            { type: "tool_use", id: "toolu_1", name: "bash", input: { command: "ls" } },
          ],
        },
      ],
    });

    const transformed = JSON.parse(transformRequestBody(body));
    expect(transformed.messages[0].content[1].name).toBe("mcp_bash");
  });

  it("transformRequestBody prefixes tool_result names in message blocks", () => {
    const body = JSON.stringify({
      messages: [
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_1",
              name: "bash",
              content: "ok",
            },
          ],
        },
      ],
    });

    const transformed = JSON.parse(transformRequestBody(body));
    expect(transformed.messages[0].content[0].name).toBe("mcp_bash");
  });

  it("transformRequestBody sanitizes system prompt OpenCode to Claude Code", () => {
    const body = JSON.stringify({
      system: [{ type: "text", text: "OpenCode and opencode" }],
    });

    const transformed = JSON.parse(transformRequestBody(body));
    expect(transformed.system[0].text).toBe("Claude Code and Claude");
  });

  it("transformRequestBody preserves paths containing /opencode", () => {
    const body = JSON.stringify({
      system: [
        {
          type: "text",
          text: "Use /path/to/opencode-foo and opencode elsewhere",
        },
      ],
    });

    const transformed = JSON.parse(transformRequestBody(body));
    expect(transformed.system[0].text).toBe("Use /path/to/opencode-foo and Claude elsewhere");
  });

  it("transformRequestBody handles empty and invalid body values gracefully", () => {
    expect(transformRequestBody("")).toBe("");
    expect(transformRequestBody(null as unknown as string)).toBe(null);
    expect(transformRequestBody(undefined as unknown as string)).toBe(undefined);
    expect(transformRequestBody("not-json")).toBe("not-json");
  });

  it("transformStreamChunk strips mcp_ prefix from tool names", () => {
    const chunk = 'data: {"type":"content_block_delta","delta":{"name":"mcp_bash"}}\n';

    expect(transformStreamChunk(chunk)).toContain('"name": "bash"');
  });

  it("transformStreamChunk leaves non-tool content unchanged", () => {
    const chunk = 'data: {"type":"content_block_delta","delta":{"text":"hello"}}\n';

    expect(transformStreamChunk(chunk)).toBe(chunk);
  });

  it("buildRequestHeaders sets auth, user-agent, and required beta values", () => {
    const headers = buildRequestHeaders("access-123", new Headers({ "content-type": "application/json" }));

    expect(headers.get("authorization")).toBe("Bearer access-123");
    expect(headers.get("user-agent")).toBe("claude-cli/2.1.2 (external, cli)");
    expect(headers.get("anthropic-beta")).toBe(
      "interleaved-thinking-2025-05-14,code-execution-2025-05-22,extended-thinking-2025-04-30,mcp-client-2025-04-04,prompt-caching-2025-04-30",
    );
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("buildRequestHeaders removes x-api-key", () => {
    const headers = buildRequestHeaders(
      "access-123",
      new Headers({
        "x-api-key": "secret",
        "content-type": "application/json",
      }),
    );

    expect(headers.has("x-api-key")).toBe(false);
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("buildRequestHeaders merges existing anthropic-beta values", () => {
    const headers = buildRequestHeaders(
      "access-123",
      new Headers({
        "anthropic-beta": "custom-beta-1, custom-beta-2",
      }),
    );

    expect(headers.get("anthropic-beta")).toBe(
      "interleaved-thinking-2025-05-14,code-execution-2025-05-22,extended-thinking-2025-04-30,mcp-client-2025-04-04,prompt-caching-2025-04-30,custom-beta-1,custom-beta-2",
    );
  });

  it("transformRequestUrl adds beta=true to /v1/messages URLs", () => {
    expect(transformRequestUrl("https://api.anthropic.com/v1/messages")).toBe(
      "https://api.anthropic.com/v1/messages?beta=true",
    );
    expect(transformRequestUrl("https://api.anthropic.com/v1/messages?foo=bar")).toBe(
      "https://api.anthropic.com/v1/messages?foo=bar&beta=true",
    );
  });

  it("createSystemTransformHook prepends identity and sanitizes OpenCode references", () => {
    const hook = createSystemTransformHook();
    const output = hook("OpenCode powers opencode workflows");

    expect(output).toBe("You are Claude Code made by Anthropic. Claude Code powers Claude workflows");
    expect(hook(output)).toBe(output);
  });
});
