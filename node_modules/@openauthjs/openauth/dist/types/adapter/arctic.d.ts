import type { OAuth2Tokens } from "arctic";
export interface ArcticAdapterOptions {
    scopes: string[];
    clientID: string;
    clientSecret: string;
    query?: Record<string, string>;
}
export declare function ArcticAdapter(adapter: new (clientID: string, clientSecret: string, callback: string) => {
    createAuthorizationURL(state: string, scopes: string[]): URL;
    validateAuthorizationCode(code: string): Promise<OAuth2Tokens>;
    refreshAccessToken(refreshToken: string): Promise<OAuth2Tokens>;
}, config: ArcticAdapterOptions): {
    type: string;
    init(routes: import("./adapter.js").AdapterRoute, ctx: import("./adapter.js").AdapterOptions<{
        tokenset: OAuth2Tokens;
    }>): void;
};
//# sourceMappingURL=arctic.d.ts.map