import { encodeBase64urlNoPadding } from "@oslojs/encoding";
import { sha256 } from "@oslojs/crypto/sha2";
export class OAuth2Tokens {
    data;
    constructor(data) {
        this.data = data;
    }
    tokenType() {
        if ("token_type" in this.data && typeof this.data.token_type === "string") {
            return this.data.token_type;
        }
        throw new Error("Missing or invalid 'token_type' field");
    }
    accessToken() {
        if ("access_token" in this.data && typeof this.data.access_token === "string") {
            return this.data.access_token;
        }
        throw new Error("Missing or invalid 'access_token' field");
    }
    accessTokenExpiresInSeconds() {
        if ("expires_in" in this.data && typeof this.data.expires_in === "number") {
            return this.data.expires_in;
        }
        throw new Error("Missing or invalid 'expires_in' field");
    }
    accessTokenExpiresAt() {
        return new Date(Date.now() + this.accessTokenExpiresInSeconds() * 1000);
    }
    hasRefreshToken() {
        return "refresh_token" in this.data && typeof this.data.refresh_token === "string";
    }
    refreshToken() {
        if ("refresh_token" in this.data && typeof this.data.refresh_token === "string") {
            return this.data.refresh_token;
        }
        throw new Error("Missing or invalid 'refresh_token' field");
    }
    hasScopes() {
        return "scope" in this.data && typeof this.data.scope === "string";
    }
    scopes() {
        if ("scope" in this.data && typeof this.data.scope === "string") {
            return this.data.scope.split(" ");
        }
        throw new Error("Missing or invalid 'scope' field");
    }
    idToken() {
        if ("id_token" in this.data && typeof this.data.id_token === "string") {
            return this.data.id_token;
        }
        throw new Error("Missing or invalid field 'id_token'");
    }
}
export function createS256CodeChallenge(codeVerifier) {
    const codeChallengeBytes = sha256(new TextEncoder().encode(codeVerifier));
    return encodeBase64urlNoPadding(codeChallengeBytes);
}
export function generateCodeVerifier() {
    const randomValues = new Uint8Array(32);
    crypto.getRandomValues(randomValues);
    return encodeBase64urlNoPadding(randomValues);
}
export function generateState() {
    const randomValues = new Uint8Array(32);
    crypto.getRandomValues(randomValues);
    return encodeBase64urlNoPadding(randomValues);
}
