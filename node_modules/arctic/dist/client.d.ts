import type { OAuth2Tokens } from "./oauth2.js";
export declare class OAuth2Client {
    clientId: string;
    private clientPassword;
    private redirectURI;
    constructor(clientId: string, clientPassword: string | null, redirectURI: string | null);
    createAuthorizationURL(authorizationEndpoint: string, state: string, scopes: string[]): URL;
    createAuthorizationURLWithPKCE(authorizationEndpoint: string, state: string, codeChallengeMethod: CodeChallengeMethod, codeVerifier: string, scopes: string[]): URL;
    validateAuthorizationCode(tokenEndpoint: string, code: string, codeVerifier: string | null): Promise<OAuth2Tokens>;
    refreshAccessToken(tokenEndpoint: string, refreshToken: string, scopes: string[]): Promise<OAuth2Tokens>;
    revokeToken(tokenRevocationEndpoint: string, token: string): Promise<void>;
}
export declare enum CodeChallengeMethod {
    S256 = 0,
    Plain = 1
}
