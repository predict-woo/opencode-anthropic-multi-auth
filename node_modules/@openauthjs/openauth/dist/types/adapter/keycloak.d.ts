import { Oauth2WrappedConfig } from "./oauth2.js";
/**
 * Configuration options for Keycloak integration.
 *
 * This interface extends the `Oauth2WrappedConfig` and includes additional
 * properties specific to Keycloak, such as the base URL and realm. It is used
 * to configure the `KeycloakAdapter`.
 */
export interface KeycloakConfig extends Oauth2WrappedConfig {
    /**
     * The base URL of the Keycloak server.
     *
     * Example: `https://your-keycloak-domain`
     */
    baseUrl: string;
    /**
     * The realm in the Keycloak server to authenticate against.
     *
     * A realm in Keycloak is like a tenant or namespace that manages a set of
     * users, credentials, roles, and groups. Each realm is independent of others.
     *
     * Example: `your-realm`
     */
    realm: string;
}
export declare function KeycloakAdapter(config: KeycloakConfig): {
    type: string;
    init(routes: import("./adapter.js").AdapterRoute, ctx: import("./adapter.js").AdapterOptions<{
        tokenset: import("./oauth2.js").Oauth2Token;
        clientID: string;
    }>): void;
};
//# sourceMappingURL=keycloak.d.ts.map