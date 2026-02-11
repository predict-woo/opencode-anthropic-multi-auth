import { CodeChallengeMethod, OAuth2Client } from "../client.js";
export class Okta {
    authorizationEndpoint;
    tokenEndpoint;
    tokenRevocationEndpoint;
    client;
    constructor(domain, authorizationServerId, clientId, clientSecret, redirectURI) {
        let baseURL = `https://${domain}/oauth2`;
        if (authorizationServerId !== null) {
            baseURL = baseURL + `/${authorizationServerId}`;
        }
        this.authorizationEndpoint = baseURL + "/v1/authorize";
        this.tokenEndpoint = baseURL + "/v1/token";
        this.tokenRevocationEndpoint = baseURL + "/v1/revoke";
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
    async refreshAccessToken(refreshToken, scopes) {
        const tokens = await this.client.refreshAccessToken(this.tokenEndpoint, refreshToken, scopes);
        return tokens;
    }
    async revokeToken(token) {
        await this.client.revokeToken(this.tokenRevocationEndpoint, token);
    }
}
