import { decodeBase64, decodeBase64urlIgnorePadding, encodeBase64urlNoPadding } from "@oslojs/encoding";
export function parseJWT(jwt) {
    const parts = jwt.split(".");
    if (parts.length !== 3) {
        throw new Error("Invalid JWT");
    }
    let jsonHeader;
    let jsonPayload;
    let signature;
    try {
        jsonHeader = new TextDecoder().decode(decodeBase64urlIgnorePadding(parts[0]));
        jsonPayload = new TextDecoder().decode(decodeBase64urlIgnorePadding(parts[1]));
        signature = decodeBase64urlIgnorePadding(parts[2]);
    }
    catch {
        throw new Error("Invalid JWT: Invalid base64url encoding");
    }
    let header;
    let payload;
    try {
        header = JSON.parse(jsonHeader);
        payload = JSON.parse(jsonPayload);
    }
    catch {
        throw new Error("Invalid JWT: Invalid JSON encoding");
    }
    if (typeof header !== "object" || header === null) {
        throw new Error("Invalid JWT: Invalid header");
    }
    if (typeof payload !== "object" || payload === null) {
        throw new Error("Invalid JWT: Invalid payload");
    }
    const signatureMessage = new TextEncoder().encode(parts[0] + "." + parts[1]);
    return [header, payload, signature, signatureMessage];
}
export function decodeJWT(jwt) {
    const parts = jwt.split(".");
    if (parts.length !== 3) {
        throw new Error("Invalid JWT");
    }
    let jsonPayload;
    try {
        jsonPayload = new TextDecoder().decode(decodeBase64urlIgnorePadding(parts[1]));
    }
    catch {
        throw new Error("Invalid JWT: Invalid base64url encoding");
    }
    let payload;
    try {
        payload = JSON.parse(jsonPayload);
    }
    catch {
        throw new Error("Invalid JWT: Invalid JSON encoding");
    }
    if (typeof payload !== "object" || payload === null) {
        throw new Error("Invalid JWT: Invalid payload");
    }
    return payload;
}
export function encodeJWT(headerJSON, payloadJSON, signature) {
    const encodedHeader = encodeBase64urlNoPadding(new TextEncoder().encode(headerJSON));
    const encodedPayload = encodeBase64urlNoPadding(new TextEncoder().encode(payloadJSON));
    const encodedSignature = encodeBase64urlNoPadding(signature);
    const jwt = encodedHeader + "." + encodedPayload + "." + encodedSignature;
    return jwt;
}
export function createJWTSignatureMessage(headerJSON, payloadJSON) {
    const encodedHeader = encodeBase64urlNoPadding(new TextEncoder().encode(headerJSON));
    const encodedPayload = encodeBase64urlNoPadding(new TextEncoder().encode(payloadJSON));
    const message = encodedHeader + "." + encodedPayload;
    return new TextEncoder().encode(message);
}
export class JWTClaims {
    target;
    constructor(target) {
        this.target = target;
    }
    hasIssuer() {
        return "iss" in this.target;
    }
    issuer() {
        if ("iss" in this.target && typeof this.target.iss === "string") {
            return this.target.iss;
        }
        throw new Error("Invalid or missing 'iss' claim");
    }
    hasSubject() {
        return "sub" in this.target;
    }
    subject() {
        if ("sub" in this.target && typeof this.target.sub === "string") {
            return this.target.sub;
        }
        throw new Error("Invalid or missing 'sub' claim");
    }
    hasAudiences() {
        return "aud" in this.target;
    }
    audiences() {
        if ("aud" in this.target && typeof this.target.aud === "string") {
            const audiences = [this.target.aud];
            return audiences;
        }
        if ("aud" in this.target && Array.isArray(this.target.aud)) {
            for (const audience in this.target.aud) {
                if (typeof audience !== "string") {
                    throw new Error("Invalid or missing 'aud' claim");
                }
            }
            return this.target.aud;
        }
        throw new Error("Invalid or missing 'aud' claim");
    }
    hasExpiration() {
        return "exp" in this.target;
    }
    expiration() {
        if ("exp" in this.target &&
            typeof this.target.exp === "number" &&
            this.target.exp >= 0 &&
            Number.isInteger(this.target.exp)) {
            return new Date(this.target.exp * 1000);
        }
        throw new Error("Invalid or missing 'exp' claim");
    }
    verifyExpiration() {
        if ("exp" in this.target &&
            typeof this.target.exp === "number" &&
            this.target.exp >= 0 &&
            Number.isInteger(this.target.exp)) {
            return Date.now() < this.target.exp * 1000;
        }
        throw new Error("Invalid or missing 'exp' claim");
    }
    hasNotBefore() {
        return "nbf" in this.target;
    }
    notBefore() {
        if ("nbf" in this.target &&
            typeof this.target.nbf === "number" &&
            this.target.nbf >= 0 &&
            Number.isInteger(this.target.nbf)) {
            return new Date(this.target.nbf * 1000);
        }
        throw new Error("Invalid or missing 'nbf' claim");
    }
    verifyNotBefore() {
        if ("nbf" in this.target &&
            typeof this.target.nbf === "number" &&
            this.target.nbf >= 0 &&
            Number.isInteger(this.target.nbf)) {
            return Date.now() >= this.target.nbf * 1000;
        }
        throw new Error("Invalid or missing 'nbf' claim");
    }
    hasIssuedAt() {
        return "iat" in this.target;
    }
    issuedAt() {
        if ("iat" in this.target &&
            typeof this.target.iat === "number" &&
            this.target.iat >= 0 &&
            Number.isInteger(this.target.iat)) {
            return new Date(this.target.iat * 1000);
        }
        throw new Error("Invalid or missing 'iat' claim");
    }
    hasJWTId() {
        return "jti" in this.target;
    }
    jwtId() {
        if ("jti" in this.target && typeof this.target.jti === "string") {
            return this.target.jti;
        }
        throw new Error("Invalid or missing 'jti' claim");
    }
}
export class JWSRegisteredHeaders {
    target;
    constructor(target) {
        this.target = target;
    }
    hasAlgorithm() {
        return "alg" in this.target;
    }
    algorithm() {
        if ("alg" in this.target && typeof this.target.alg === "string") {
            return this.target.alg;
        }
        throw new Error("Invalid or missing 'alg' claim");
    }
    hasJWKSetURL() {
        return "jku" in this.target;
    }
    jwkSetURL() {
        if ("jku" in this.target && typeof this.target.jku === "string") {
            return this.target.jku;
        }
        throw new Error("Invalid or missing 'jku' claim");
    }
    hasJWK() {
        return "jwk" in this.target;
    }
    jwk() {
        if ("jwk" in this.target && typeof this.target.jwk === "string") {
            return this.target.jwk;
        }
        throw new Error("Invalid or missing 'jwk' claim");
    }
    hasKeyId() {
        return "kid" in this.target;
    }
    keyId() {
        if ("kid" in this.target && typeof this.target.kid === "string") {
            return this.target.kid;
        }
        throw new Error("Invalid or missing 'kid' claim");
    }
    hasX509URL() {
        return "x5u" in this.target;
    }
    x509URL() {
        if ("x5u" in this.target && typeof this.target.x5u === "string") {
            return this.target.x5u;
        }
        throw new Error("Invalid or missing 'x5u' claim");
    }
    hasX509CertificateChain() {
        return "x5c" in this.target;
    }
    x509CertificateChain() {
        if ("x5c" in this.target && Array.isArray(this.target.x5c)) {
            if (this.target.x5c.length === 0) {
                throw new Error("Invalid or missing 'x5c' claim");
            }
            const chain = [];
            for (const encoded of this.target.x5c) {
                if (typeof encoded !== "string") {
                    throw new Error("Invalid or missing 'x5c' claim");
                }
                try {
                    chain.push(decodeBase64(encoded));
                }
                catch {
                    throw new Error("Invalid or missing 'x5c' claim");
                }
            }
            return chain;
        }
        throw new Error("Invalid or missing 'x5c' claim");
    }
    hasX509CertificateSHA1Thumbprint() {
        return "x5t" in this.target;
    }
    x509CertificateSHA1Thumbprint() {
        if ("x5t" in this.target && typeof this.target.x5t === "string") {
            try {
                const thumbprint = decodeBase64urlIgnorePadding(this.target.x5t);
                return thumbprint;
            }
            catch {
                throw new Error("Invalid or missing 'x5t' claim");
            }
        }
        throw new Error("Invalid or missing 'x5t' claim");
    }
    hasX509CertificateSHA256Thumbprint() {
        return "x5t#S256" in this.target;
    }
    x509CertificateSHA256Thumbprint() {
        if ("x5t#S256" in this.target && typeof this.target["x5t#S256"] === "string") {
            try {
                const thumbprint = decodeBase64urlIgnorePadding(this.target["x5t#S256"]);
                return thumbprint;
            }
            catch {
                throw new Error("Invalid or missing 'x5t#S256' claim");
            }
        }
        throw new Error("Invalid or missing 'x5t#S256' claim");
    }
    hasType() {
        return "typ" in this.target;
    }
    type() {
        if ("typ" in this.target && typeof this.target.typ === "string") {
            return this.target.typ;
        }
        throw new Error("Invalid or missing 'typ' claim");
    }
    hasContentType() {
        return "cty" in this.target;
    }
    contentType() {
        if ("cty" in this.target && typeof this.target.cty === "string") {
            return this.target.cty;
        }
        throw new Error("Invalid or missing 'cty' claim");
    }
    hasCritical() {
        return "crit" in this.target;
    }
    critical() {
        if ("crit" in this.target && Array.isArray(this.target.crit)) {
            if (this.target.crit.length === 0) {
                throw new Error("Invalid or missing 'crit' claim");
            }
            for (const audience in this.target.crit) {
                if (typeof audience !== "string") {
                    throw new Error("Invalid or missing 'crit' claim");
                }
            }
            return this.target.crit;
        }
        throw new Error("Invalid or missing 'crit' claim");
    }
}
export const joseAlgorithmHS256 = "HS256";
export const joseAlgorithmES256 = "ES256";
export const joseAlgorithmRS256 = "RS256";
