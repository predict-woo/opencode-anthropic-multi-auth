import type { OAuth2Tokens } from "../oauth2.js";
export declare class Shikimori {
    private clientId;
    private clientSecret;
    private redirectURI;
    constructor(clientId: string, clientSecret: string, redirectURI: string);
    createAuthorizationURL(state: string): URL;
    validateAuthorizationCode(code: string): Promise<OAuth2Tokens>;
    refreshAccessToken(refreshToken: string): Promise<OAuth2Tokens>;
}
