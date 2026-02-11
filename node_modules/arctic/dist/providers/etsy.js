import { CodeChallengeMethod, OAuth2Client } from "../client.js";
const authorizationEndpoint = "https://www.etsy.com/oauth/connect";
const tokenEndpoint = "https://api.etsy.com/v3/public/oauth/token";
export class Etsy {
    client;
    // v3: Remove `_ignore`
    constructor(clientId, _ignore, redirectURI) {
        this.client = new OAuth2Client(clientId, null, redirectURI);
    }
    createAuthorizationURL(state, codeVerifier, scopes) {
        const url = this.client.createAuthorizationURLWithPKCE(authorizationEndpoint, state, CodeChallengeMethod.S256, codeVerifier, scopes);
        return url;
    }
    async validateAuthorizationCode(code, codeVerifier) {
        const tokens = await this.client.validateAuthorizationCode(tokenEndpoint, code, codeVerifier);
        return tokens;
    }
    async refreshAccessToken(refreshToken) {
        const tokens = await this.client.refreshAccessToken(tokenEndpoint, refreshToken, []);
        return tokens;
    }
}
