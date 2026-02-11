import type { OAuth2Tokens } from "arctic"
import { Context } from "hono"
import { Adapter } from "./adapter.js"
import { OauthError } from "../error.js"

export interface ArcticAdapterOptions {
  scopes: string[]
  clientID: string
  clientSecret: string
  query?: Record<string, string>
}

interface AdapterState {
  state: string
}

export function ArcticAdapter(
  adapter: new (
    clientID: string,
    clientSecret: string,
    callback: string,
  ) => {
    createAuthorizationURL(state: string, scopes: string[]): URL
    validateAuthorizationCode(code: string): Promise<OAuth2Tokens>
    refreshAccessToken(refreshToken: string): Promise<OAuth2Tokens>
  },
  config: ArcticAdapterOptions,
) {
  function getClient(c: Context) {
    const callback = new URL(c.req.url)
    callback.pathname = callback.pathname.replace(/authorize.*$/, "callback")
    callback.search = ""
    callback.host = c.req.header("x-forwarded-host") || callback.host
    return new adapter(
      config.clientID,
      config.clientSecret,
      callback.toString(),
    )
  }
  return {
    type: "arctic",
    init(routes, ctx) {
      routes.get("/authorize", async (c) => {
        const client = getClient(c)
        const state = crypto.randomUUID()
        await ctx.set(c, "adapter", 60 * 10, {
          state,
        })
        return c.redirect(client.createAuthorizationURL(state, config.scopes))
      })

      routes.get("/callback", async (c) => {
        const client = getClient(c)
        const adapter = (await ctx.get(c, "adapter")) as AdapterState
        if (!adapter) return c.redirect("../authorize")
        const code = c.req.query("code")
        const state = c.req.query("state")
        if (!code) throw new Error("Missing code")
        if (state !== adapter.state)
          throw new OauthError("invalid_request", "Invalid state")
        const tokens = await client.validateAuthorizationCode(code)
        return ctx.success(c, {
          tokenset: tokens,
        })
      })
    },
  } satisfies Adapter<{
    tokenset: OAuth2Tokens
  }>
}
