import { OAuth2Client } from "../client.js";
const authorizationEndpoint = "https://www.tumblr.com/oauth2/authorize";
const tokenEndpoint = "https://api.tumblr.com/v2/oauth2/token";
export class Tumblr {
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
}
