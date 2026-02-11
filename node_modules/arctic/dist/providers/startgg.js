import { createOAuth2Request, sendTokenRequest } from "../request.js";
const authorizationEndpoint = "https://start.gg/oauth/authoriz";
const tokenEndpoint = "https://api.start.gg/oauth/access_token";
const refreshEndpoint = "https://api.start.gg/oauth/refresh";
export class StartGG {
    clientId;
    clientSecret;
    redirectURI;
    constructor(clientId, clientSecret, redirectURI) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectURI = redirectURI;
    }
    createAuthorizationURL(state, scopes) {
        const url = new URL(authorizationEndpoint);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("client_id", this.clientId);
        url.searchParams.set("state", state);
        url.searchParams.set("scope", scopes.join(" "));
        url.searchParams.set("redirect_uri", this.redirectURI);
        return url;
    }
    async validateAuthorizationCode(code, scopes) {
        const body = new URLSearchParams();
        body.set("grant_type", "authorization_code");
        body.set("code", code);
        body.set("redirect_uri", this.redirectURI);
        body.set("client_id", this.clientId);
        body.set("client_secret", this.clientSecret);
        body.set("scope", scopes.join(" "));
        const request = createOAuth2Request(tokenEndpoint, body);
        const tokens = await sendTokenRequest(request);
        return tokens;
    }
    async refreshAccessToken(refreshToken, scopes) {
        const body = new URLSearchParams();
        body.set("grant_type", "refresh_token");
        body.set("refresh_token", refreshToken);
        body.set("redirect_uri", this.redirectURI);
        body.set("client_id", this.clientId);
        body.set("client_secret", this.clientSecret);
        body.set("scope", scopes.join(" "));
        const request = createOAuth2Request(refreshEndpoint, body);
        const tokens = await sendTokenRequest(request);
        return tokens;
    }
}
