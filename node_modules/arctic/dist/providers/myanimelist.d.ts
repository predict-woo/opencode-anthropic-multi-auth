import type { OAuth2Tokens } from "../oauth2.js";
export declare class MyAnimeList {
    private client;
    constructor(clientId: string, clientSecret: string, options?: {
        redirectURI?: string;
    });
    createAuthorizationURL(state: string, codeVerifier: string): URL;
    validateAuthorizationCode(code: string, codeVerifier: string): Promise<OAuth2Tokens>;
    refreshAccessToken(refreshToken: string): Promise<OAuth2Tokens>;
}
