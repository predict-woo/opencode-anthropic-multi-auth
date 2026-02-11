import { createOAuth2Request, sendTokenRequest } from "../request.js";
const authorizationEndpoint = "https://nid.naver.com/oauth2.0/authorize";
const tokenEndpoint = "https://nid.naver.com/oauth2.0/token";
export class Naver {
    clientId;
    clientSecret;
    redirectURI;
    constructor(clientId, clientSecret, redirectURI) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectURI = redirectURI;
    }
    createAuthorizationURL() {
        const url = new URL(authorizationEndpoint);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("client_id", this.clientId);
        url.searchParams.set("redirect_uri", this.redirectURI);
        return url;
    }
    async validateAuthorizationCode(code) {
        const body = new URLSearchParams();
        body.set("grant_type", "authorization_code");
        body.set("client_id", this.clientId);
        body.set("client_secret", this.clientSecret);
        body.set("code", code);
        body.set("redirect_uri", this.redirectURI);
        const request = createOAuth2Request(tokenEndpoint, body);
        const tokens = await sendTokenRequest(request);
        return tokens;
    }
    async refreshAccessToken(refreshToken) {
        const body = new URLSearchParams();
        body.set("grant_type", "refresh_token");
        body.set("client_id", this.clientId);
        body.set("client_secret", this.clientSecret);
        body.set("refresh_token", refreshToken);
        const request = createOAuth2Request(tokenEndpoint, body);
        const tokens = await sendTokenRequest(request);
        return tokens;
    }
}
