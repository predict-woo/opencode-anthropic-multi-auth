export interface Oauth2Config {
    type?: string;
    clientID: string;
    clientSecret: string;
    endpoint: {
        authorization: string;
        token: string;
    };
    scopes: string[];
    query?: Record<string, string>;
}
export type Oauth2WrappedConfig = Omit<Oauth2Config, "endpoint" | "name">;
export interface Oauth2Token {
    access: string;
    refresh: string;
    expiry: number;
    raw: Record<string, any>;
}
export declare function Oauth2Adapter(config: Oauth2Config): {
    type: string;
    init(routes: import("./adapter.js").AdapterRoute, ctx: import("./adapter.js").AdapterOptions<{
        tokenset: Oauth2Token;
        clientID: string;
    }>): void;
};
//# sourceMappingURL=oauth2.d.ts.map