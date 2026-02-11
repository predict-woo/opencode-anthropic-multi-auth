import type { OAuth2Tokens } from "../oauth2.js";
export declare class Roblox {
    private client;
    constructor(clientId: string, clientSecret: string, redirectURI: string);
    createAuthorizationURL(state: string, codeVerifier: string, scopes: string[]): URL;
    validateAuthorizationCode(code: string, codeVerifier: string): Promise<OAuth2Tokens>;
    refreshAccessToken(refreshToken: string): Promise<OAuth2Tokens>;
    revokeToken(token: string): Promise<void>;
}
