import type { OAuth2Tokens } from "../oauth2.js";
export declare class AmazonCognito {
    private authorizationEndpoint;
    private tokenEndpoint;
    private tokenRevocationEndpoint;
    private clientId;
    private clientSecret;
    private redirectURI;
    constructor(userPool: string, clientId: string, clientSecret: string, redirectURI: string);
    createAuthorizationURL(state: string, codeVerifier: string, scopes: string[]): URL;
    validateAuthorizationCode(code: string, codeVerifier: string): Promise<OAuth2Tokens>;
    refreshAccessToken(refreshToken: string): Promise<OAuth2Tokens>;
    revokeToken(token: string): Promise<void>;
}
