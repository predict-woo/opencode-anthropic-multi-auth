import type { OAuth2Tokens } from "../oauth2.js";
export declare class Etsy {
    private client;
    constructor(clientId: string, _ignore: any, redirectURI: string);
    createAuthorizationURL(state: string, codeVerifier: string, scopes: string[]): URL;
    validateAuthorizationCode(code: string, codeVerifier: string): Promise<OAuth2Tokens>;
    refreshAccessToken(refreshToken: string): Promise<OAuth2Tokens>;
}
