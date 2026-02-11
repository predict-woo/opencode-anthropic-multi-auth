import { OAuth2Client } from "../client.js";
export class GitLab {
    authorizationEndpoint;
    tokenEndpoint;
    tokenRevocationEndpoint;
    client;
    constructor(domain, clientId, clientSecret, redirectURI) {
        this.authorizationEndpoint = `https://${domain}/oauth/authorize`;
        this.tokenEndpoint = `https://${domain}/oauth/token`;
        this.tokenRevocationEndpoint = `https://${domain}/oauth/revoke`;
        this.client = new OAuth2Client(clientId, clientSecret, redirectURI);
    }
    createAuthorizationURL(state, scopes) {
        const url = this.client.createAuthorizationURL(this.authorizationEndpoint, state, scopes);
        return url;
    }
    async validateAuthorizationCode(code) {
        const tokens = await this.client.validateAuthorizationCode(this.tokenEndpoint, code, null);
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
