import type { OAuth2Tokens } from "../oauth2.js";
export declare class Lichess {
    private client;
    constructor(clientId: string, redirectURI: string);
    createAuthorizationURL(state: string, codeVerifier: string, scopes: string[]): URL;
    validateAuthorizationCode(code: string, codeVerifier: string): Promise<OAuth2Tokens>;
}
