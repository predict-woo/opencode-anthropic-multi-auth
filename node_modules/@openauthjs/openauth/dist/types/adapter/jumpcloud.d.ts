import { Oauth2WrappedConfig } from "./oauth2.js";
export declare function JumpCloudAdapter(config: Oauth2WrappedConfig): {
    type: string;
    init(routes: import("./adapter.js").AdapterRoute, ctx: import("./adapter.js").AdapterOptions<{
        tokenset: import("./oauth2.js").Oauth2Token;
        clientID: string;
    }>): void;
};
//# sourceMappingURL=jumpcloud.d.ts.map