export declare class OAuth2Tokens {
    data: object;
    constructor(data: object);
    tokenType(): string;
    accessToken(): string;
    accessTokenExpiresInSeconds(): number;
    accessTokenExpiresAt(): Date;
    hasRefreshToken(): boolean;
    refreshToken(): string;
    hasScopes(): boolean;
    scopes(): string[];
    idToken(): string;
}
export declare function createS256CodeChallenge(codeVerifier: string): string;
export declare function generateCodeVerifier(): string;
export declare function generateState(): string;
