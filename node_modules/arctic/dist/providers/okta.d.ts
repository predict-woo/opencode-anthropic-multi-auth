import type { OAuth2Tokens } from "../oauth2.js";
export declare class Okta {
    private authorizationEndpoint;
    private tokenEndpoint;
    private tokenRevocationEndpoint;
    private client;
    constructor(domain: string, authorizationServerId: string | null, clientId: string, clientSecret: string, redirectURI: string);
    createAuthorizationURL(state: string, codeVerifier: string, scopes: string[]): URL;
    validateAuthorizationCode(code: string, codeVerifier: string): Promise<OAuth2Tokens>;
    refreshAccessToken(refreshToken: string, scopes: string[]): Promise<OAuth2Tokens>;
    revokeToken(token: string): Promise<void>;
}
