import { OAuth2Client } from "../client.js";
const authorizationEndpoint = "https://www.figma.com/oauth";
const tokenEndpoint = "https://www.figma.com/api/oauth/token";
const refreshEndpoint = "https://api.figma.com/v1/oauth/refresh";
export class Figma {
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
        const tokens = await this.client.refreshAccessToken(refreshEndpoint, refreshToken, []);
        return tokens;
    }
}
