export const TOOL_PREFIX = "mcp_";

const REQUIRED_BETAS = [
  "interleaved-thinking-2025-05-14",
  "code-execution-2025-05-22",
  "extended-thinking-2025-04-30",
  "mcp-client-2025-04-04",
  "prompt-caching-2025-04-30",
];

const SYSTEM_IDENTITY_PREFIX = "You are Claude Code made by Anthropic. ";

function sanitizeText(text: string): string {
  return text.replace(/OpenCode/g, "Claude Code").replace(/(?<!\/)opencode/gi, "Claude");
}

function sanitizeSystem(system: unknown): unknown {
  if (typeof system === "string") {
    return sanitizeText(system);
  }

  if (Array.isArray(system)) {
    return system.map((item) => {
      if (
        item &&
        typeof item === "object" &&
        "type" in item &&
        "text" in item &&
        item.type === "text" &&
        typeof item.text === "string"
      ) {
        return {
          ...item,
          text: sanitizeText(item.text),
        };
      }
      return item;
    });
  }

  return system;
}

export function transformRequestBody(bodyString: string | null | undefined): string | null | undefined {
  if (!bodyString || typeof bodyString !== "string") {
    return bodyString;
  }

  try {
    const parsed = JSON.parse(bodyString);

    if (parsed.system) {
      parsed.system = sanitizeSystem(parsed.system);
    }

    if (parsed.tools && Array.isArray(parsed.tools)) {
      parsed.tools = parsed.tools.map((tool: { name?: string }) => ({
        ...tool,
        name: tool.name ? `${TOOL_PREFIX}${tool.name}` : tool.name,
      }));
    }

    if (parsed.messages && Array.isArray(parsed.messages)) {
      parsed.messages = parsed.messages.map((message: { content?: Array<Record<string, unknown>> }) => {
        if (!message.content || !Array.isArray(message.content)) {
          return message;
        }

        message.content = message.content.map((block) => {
          if (
            block &&
            typeof block === "object" &&
            (block.type === "tool_use" || block.type === "tool_result") &&
            typeof block.name === "string"
          ) {
            return {
              ...block,
              name: `${TOOL_PREFIX}${block.name}`,
            };
          }
          return block;
        });

        return message;
      });
    }

    return JSON.stringify(parsed);
  } catch {
    return bodyString;
  }
}

export function transformStreamChunk(text: string): string {
  return text.replace(/"name"\s*:\s*"mcp_([^"]+)"/g, '"name": "$1"');
}

export function buildRequestHeaders(accessToken: string, originalHeaders: Headers): Headers {
  const requestHeaders = new Headers();
  originalHeaders.forEach((value, key) => {
    requestHeaders.set(key, value);
  });

  const incomingBeta = requestHeaders.get("anthropic-beta") || "";
  const incomingBetasList = incomingBeta
    .split(",")
    .map((beta) => beta.trim())
    .filter(Boolean);
  const mergedBetas = [...new Set([...REQUIRED_BETAS, ...incomingBetasList])].join(",");

  requestHeaders.set("authorization", `Bearer ${accessToken}`);
  requestHeaders.set("anthropic-beta", mergedBetas);
  requestHeaders.set("user-agent", "claude-cli/2.1.2 (external, cli)");
  requestHeaders.delete("x-api-key");

  return requestHeaders;
}

export function transformRequestUrl(input: string | URL | Request): string | URL | Request {
  let url: URL;

  try {
    if (typeof input === "string") {
      url = new URL(input);
    } else if (input instanceof URL) {
      url = new URL(input.toString());
    } else {
      url = new URL(input.url);
    }
  } catch {
    return input;
  }

  if (url.pathname !== "/v1/messages" || url.searchParams.has("beta")) {
    return input;
  }

  url.searchParams.set("beta", "true");

  if (typeof input === "string") {
    return url.toString();
  }
  if (input instanceof URL) {
    return url;
  }

  return new Request(url.toString(), input);
}

export function createSystemTransformHook(): (system: string) => string {
  return (system: string) => {
    const sanitized = sanitizeText(system);
    if (sanitized.startsWith(SYSTEM_IDENTITY_PREFIX)) {
      return sanitized;
    }
    return `${SYSTEM_IDENTITY_PREFIX}${sanitized}`;
  };
}
