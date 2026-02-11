import { Oauth2WrappedConfig } from "./oauth2.js";
export interface CognitoConfig extends Oauth2WrappedConfig {
    domain: string;
    region: string;
}
export declare function CognitoAdapter(config: CognitoConfig): {
    type: string;
    init(routes: import("./adapter.js").AdapterRoute, ctx: import("./adapter.js").AdapterOptions<{
        tokenset: import("./oauth2.js").Oauth2Token;
        clientID: string;
    }>): void;
};
//# sourceMappingURL=cognito.d.ts.map