import { CodeChallengeMethod, OAuth2Client } from "../client.js";
export class MicrosoftEntraId {
    authorizationEndpoint;
    tokenEndpoint;
    client;
    constructor(tenant, clientId, clientSecret, redirectURI) {
        this.authorizationEndpoint = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`;
        this.tokenEndpoint = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
        this.client = new OAuth2Client(clientId, clientSecret, redirectURI);
    }
    createAuthorizationURL(state, codeVerifier, scopes) {
        const url = this.client.createAuthorizationURLWithPKCE(this.authorizationEndpoint, state, CodeChallengeMethod.S256, codeVerifier, scopes);
        return url;
    }
    async validateAuthorizationCode(code, codeVerifier) {
        const tokens = await this.client.validateAuthorizationCode(this.tokenEndpoint, code, codeVerifier);
        return tokens;
    }
    // v3 TODO: Add `scopes` parameter
    async refreshAccessToken(refreshToken) {
        const tokens = await this.client.refreshAccessToken(this.tokenEndpoint, refreshToken, []);
        return tokens;
    }
}
