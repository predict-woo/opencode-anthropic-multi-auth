/*
While HTTP basic auth is supported when used without PKCE,
only client secret is supported when PKCE is used.
*/
import { createS256CodeChallenge } from "../oauth2.js";
import { createOAuth2Request, sendTokenRequest, sendTokenRevocationRequest } from "../request.js";
export class AmazonCognito {
    authorizationEndpoint;
    tokenEndpoint;
    tokenRevocationEndpoint;
    clientId;
    clientSecret;
    redirectURI;
    constructor(userPool, clientId, clientSecret, redirectURI) {
        this.authorizationEndpoint = userPool + "/oauth2/authorize";
        this.tokenEndpoint = userPool + "/oauth2/token";
        this.tokenRevocationEndpoint = userPool + "/oauth2/revoke";
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectURI = redirectURI;
    }
    createAuthorizationURL(state, codeVerifier, scopes) {
        const url = new URL(this.authorizationEndpoint);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("client_id", this.clientId);
        url.searchParams.set("redirect_uri", this.redirectURI);
        url.searchParams.set("state", state);
        const codeChallenge = createS256CodeChallenge(codeVerifier);
        url.searchParams.set("code_challenge_method", "S256");
        url.searchParams.set("code_challenge", codeChallenge);
        if (scopes.length > 0) {
            url.searchParams.set("scope", scopes.join(" "));
        }
        return url;
    }
    async validateAuthorizationCode(code, codeVerifier) {
        const body = new URLSearchParams();
        body.set("grant_type", "authorization_code");
        body.set("code", code);
        body.set("redirect_uri", this.redirectURI);
        body.set("code_verifier", codeVerifier);
        body.set("client_id", this.clientId);
        body.set("client_secret", this.clientSecret);
        const request = createOAuth2Request(this.tokenEndpoint, body);
        const tokens = await sendTokenRequest(request);
        return tokens;
    }
    // TODO: Add `scopes` parameter
    async refreshAccessToken(refreshToken) {
        const body = new URLSearchParams();
        body.set("grant_type", "refresh_token");
        body.set("refresh_token", refreshToken);
        body.set("client_id", this.clientId);
        body.set("client_secret", this.clientSecret);
        const request = createOAuth2Request(this.tokenEndpoint, body);
        const tokens = await sendTokenRequest(request);
        return tokens;
    }
    async revokeToken(token) {
        const body = new URLSearchParams();
        body.set("token", token);
        body.set("client_id", this.clientId);
        body.set("client_secret", this.clientSecret);
        const request = createOAuth2Request(this.tokenRevocationEndpoint, body);
        await sendTokenRevocationRequest(request);
    }
}
