import { OAuth2Tokens } from "./oauth2.js";
export declare function createOAuth2Request(endpoint: string, body: URLSearchParams): Request;
export declare function encodeBasicCredentials(username: string, password: string): string;
export declare function sendTokenRequest(request: Request): Promise<OAuth2Tokens>;
export declare function sendTokenRevocationRequest(request: Request): Promise<void>;
export declare class ArcticFetchError extends Error {
    constructor(cause: unknown);
}
export declare class OAuth2RequestError extends Error {
    code: string;
    description: string | null;
    uri: string | null;
    state: string | null;
    constructor(code: string, description: string | null, uri: string | null, state: string | null);
}
