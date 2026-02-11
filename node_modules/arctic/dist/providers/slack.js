import { OAuth2Client } from "../client.js";
const authorizationEndpoint = "https://slack.com/openid/connect/authorize";
const tokenEndpoint = "https://slack.com/api/openid.connect.token";
export class Slack {
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
}
