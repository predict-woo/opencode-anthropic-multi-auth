import { OAuth2Client } from "../client.js";
const authorizationEndpoint = "https://appcenter.intuit.com/connect/oauth2";
const tokenEndpoint = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const tokenRevocationEndpoint = "https://developer.API.intuit.com/v2/oauth2/tokens/revoke";
export class Intuit {
    client;
    constructor(clientId, clientSecret, redirectURI) {
        this.client = new OAuth2Client(clientId, clientSecret, redirectURI);
    }
    createAuthorizationURL(state, scopes) {
        const url = this.client.createAuthorizationURL(authorizationEndpoint, state, scopes);
        return url;
    }
    async validateAuthorizationCode(code) {
        const tokens = await this.client.validateAuthorizationCode(tokenEndpoint, code, null);
        return tokens;
    }
    async refreshAccessToken(refreshToken) {
        const tokens = await this.client.refreshAccessToken(tokenEndpoint, refreshToken, []);
        return tokens;
    }
    async revokeToken(token) {
        await this.client.revokeToken(tokenRevocationEndpoint, token);
    }
}
