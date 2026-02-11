// src/error.ts
class OauthError extends Error {
  error;
  description;
  constructor(error, description) {
    super(error + " - " + description);
    this.error = error;
    this.description = description;
  }
}

class MissingProviderError extends OauthError {
  constructor() {
    super("invalid_request", "Must specify `provider` query parameter if `select` callback on authorizer is not specified");
  }
}

class MissingParameterError extends OauthError {
  parameter;
  constructor(parameter) {
    super("invalid_request", "Missing parameter: " + parameter);
    this.parameter = parameter;
  }
}

class UnauthorizedClientError extends OauthError {
  clientID;
  constructor(clientID, redirectURI) {
    super("unauthorized_client", `Client ${clientID} is not authorized to use this redirect_uri: ${redirectURI}`);
    this.clientID = clientID;
  }
}

class UnknownStateError extends Error {
  constructor() {
    super("The browser was in an unknown state. This could be because certain cookies expired or the browser was switched in the middle of an authentication flow");
  }
}

class InvalidSubjectError extends Error {
  constructor() {
    super("Invalid subject");
  }
}

class InvalidRefreshTokenError extends Error {
  constructor() {
    super("Invalid refresh token");
  }
}

class InvalidAccessTokenError extends Error {
  constructor() {
    super("Invalid access token");
  }
}

class InvalidAuthorizationCodeError extends Error {
  constructor() {
    super("Invalid authorization code");
  }
}
export {
  UnknownStateError,
  UnauthorizedClientError,
  OauthError,
  MissingProviderError,
  MissingParameterError,
  InvalidSubjectError,
  InvalidRefreshTokenError,
  InvalidAuthorizationCodeError,
  InvalidAccessTokenError
};
