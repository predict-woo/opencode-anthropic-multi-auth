import { OAuth2Client } from "../client.js";
const authorizationEndpoint = "https://www.dropbox.com/oauth2/authorize";
const tokenEndpoint = "https://api.dropboxapi.com/oauth2/token";
const tokenRevocationEndpoint = "https://api.dropboxapi.com/2/auth/token/revoke";
export class Dropbox {
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
