import type { OAuth2Tokens } from "../oauth2.js";
export declare class Tumblr {
    private client;
    constructor(clientId: string, clientSecret: string, redirectURI: string);
    createAuthorizationURL(state: string, scopes: string[]): URL;
    validateAuthorizationCode(code: string): Promise<OAuth2Tokens>;
    refreshAccessToken(refreshToken: string): Promise<OAuth2Tokens>;
}
