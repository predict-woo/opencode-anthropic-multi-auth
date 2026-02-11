import { describe, it, expect } from "vitest";
import { AnthropicMultiAuthPlugin } from "../index";

describe("AnthropicMultiAuthPlugin", () => {
  it("should be a function", () => {
    expect(typeof AnthropicMultiAuthPlugin).toBe("function");
  });

  it("should be callable and return a promise", async () => {
    const result = AnthropicMultiAuthPlugin({ client: {} } as any);
    expect(result).toBeInstanceOf(Promise);
    const hooks = await result;
    expect(hooks).toBeDefined();
  });
});
