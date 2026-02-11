import { Oauth2Adapter, Oauth2WrappedConfig } from "./oauth2.js"

export function GithubAdapter(config: Oauth2WrappedConfig) {
  return Oauth2Adapter({
    ...config,
    type: "github",
    endpoint: {
      authorization: "https://github.com/login/oauth/authorize",
      token: "https://github.com/login/oauth/access_token",
    },
  })
}
