import { CodeChallengeMethod, OAuth2Client } from "../client.js";
export class KeyCloak {
    authorizationEndpoint;
    tokenEndpoint;
    tokenRevocationEndpoint;
    client;
    constructor(realmURL, clientId, clientSecret, redirectURI) {
        this.authorizationEndpoint = realmURL + "/protocol/openid-connect/auth";
        this.tokenEndpoint = realmURL + "/protocol/openid-connect/token";
        this.tokenRevocationEndpoint = realmURL + "/protocol/openid-connect/revoke";
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
    async refreshAccessToken(refreshToken) {
        const tokens = await this.client.refreshAccessToken(this.tokenEndpoint, refreshToken, []);
        return tokens;
    }
    async revokeToken(token) {
        await this.client.revokeToken(this.tokenRevocationEndpoint, token);
    }
}
