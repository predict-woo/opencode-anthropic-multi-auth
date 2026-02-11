import { Oauth2Adapter, Oauth2WrappedConfig } from "./oauth2.js"

export function TwitchAdapter(config: Oauth2WrappedConfig) {
  return Oauth2Adapter({
    type: "twitch",
    ...config,
    endpoint: {
      authorization: "https://id.twitch.tv/oauth2/authorize",
      token: "https://id.twitch.tv/oauth2/token",
    },
  })
}
