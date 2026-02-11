import type { OAuth2Tokens } from "../oauth2.js";
export declare class Apple {
    private clientId;
    private teamId;
    private keyId;
    private pkcs8PrivateKey;
    private redirectURI;
    constructor(clientId: string, teamId: string, keyId: string, pkcs8PrivateKey: Uint8Array, redirectURI: string);
    createAuthorizationURL(state: string, scopes: string[]): URL;
    validateAuthorizationCode(code: string): Promise<OAuth2Tokens>;
    private createClientSecret;
}
