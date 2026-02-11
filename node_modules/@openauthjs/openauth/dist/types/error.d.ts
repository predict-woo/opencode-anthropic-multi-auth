export declare class OauthError extends Error {
    error: "invalid_request" | "invalid_grant" | "unauthorized_client" | "access_denied" | "unsupported_grant_type" | "server_error" | "temporarily_unavailable";
    description: string;
    constructor(error: "invalid_request" | "invalid_grant" | "unauthorized_client" | "access_denied" | "unsupported_grant_type" | "server_error" | "temporarily_unavailable", description: string);
}
export declare class MissingProviderError extends OauthError {
    constructor();
}
export declare class MissingParameterError extends OauthError {
    parameter: string;
    constructor(parameter: string);
}
export declare class UnauthorizedClientError extends OauthError {
    clientID: string;
    constructor(clientID: string, redirectURI: string);
}
export declare class UnknownStateError extends Error {
    constructor();
}
export declare class InvalidSubjectError extends Error {
    constructor();
}
export declare class InvalidRefreshTokenError extends Error {
    constructor();
}
export declare class InvalidAccessTokenError extends Error {
    constructor();
}
export declare class InvalidAuthorizationCodeError extends Error {
    constructor();
}
//# sourceMappingURL=error.d.ts.map