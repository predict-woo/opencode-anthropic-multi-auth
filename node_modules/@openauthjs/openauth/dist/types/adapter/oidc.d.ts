import { JWTPayload } from "hono/utils/jwt/types";
export interface OidcConfig {
    type?: string;
    clientID: string;
    issuer: string;
    scopes?: string[];
    query?: Record<string, string>;
}
export type OidcWrappedConfig = Omit<OidcConfig, "issuer" | "name">;
export interface IdTokenResponse {
    idToken: string;
    claims: Record<string, any>;
    raw: Record<string, any>;
}
export declare function OidcAdapter(config: OidcConfig): {
    type: string;
    init(routes: import("./adapter.js").AdapterRoute, ctx: import("./adapter.js").AdapterOptions<{
        id: JWTPayload;
        clientID: string;
    }>): void;
};
//# sourceMappingURL=oidc.d.ts.map