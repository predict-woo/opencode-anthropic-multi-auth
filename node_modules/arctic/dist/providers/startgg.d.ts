import type { OAuth2Tokens } from "../oauth2.js";
export declare class StartGG {
    private clientId;
    private clientSecret;
    private redirectURI;
    constructor(clientId: string, clientSecret: string, redirectURI: string);
    createAuthorizationURL(state: string, scopes: string[]): URL;
    validateAuthorizationCode(code: string, scopes: string[]): Promise<OAuth2Tokens>;
    refreshAccessToken(refreshToken: string, scopes: string[]): Promise<OAuth2Tokens>;
}
