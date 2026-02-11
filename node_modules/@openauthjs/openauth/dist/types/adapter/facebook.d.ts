import { Oauth2WrappedConfig } from "./oauth2.js";
import { OidcWrappedConfig } from "./oidc.js";
export declare function FacebookAdapter(config: Oauth2WrappedConfig): {
    type: string;
    init(routes: import("./adapter.js").AdapterRoute, ctx: import("./adapter.js").AdapterOptions<{
        tokenset: import("./oauth2.js").Oauth2Token;
        clientID: string;
    }>): void;
};
export declare function FacebookOidcAdapter(config: OidcWrappedConfig): {
    type: string;
    init(routes: import("./adapter.js").AdapterRoute, ctx: import("./adapter.js").AdapterOptions<{
        id: import("hono/utils/jwt/types").JWTPayload;
        clientID: string;
    }>): void;
};
//# sourceMappingURL=facebook.d.ts.map