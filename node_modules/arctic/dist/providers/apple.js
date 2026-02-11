import { createOAuth2Request, sendTokenRequest } from "../request.js";
import { createJWTSignatureMessage, encodeJWT } from "@oslojs/jwt";
const authorizationEndpoint = "https://appleid.apple.com/auth/authorize";
const tokenEndpoint = "https://appleid.apple.com/auth/token";
export class Apple {
    clientId;
    teamId;
    keyId;
    pkcs8PrivateKey;
    redirectURI;
    constructor(clientId, teamId, keyId, pkcs8PrivateKey, redirectURI) {
        this.clientId = clientId;
        this.teamId = teamId;
        this.keyId = keyId;
        this.pkcs8PrivateKey = pkcs8PrivateKey;
        this.redirectURI = redirectURI;
    }
    createAuthorizationURL(state, scopes) {
        const url = new URL(authorizationEndpoint);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("client_id", this.clientId);
        url.searchParams.set("state", state);
        url.searchParams.set("scope", scopes.join(" "));
        url.searchParams.set("redirect_uri", this.redirectURI);
        return url;
    }
    async validateAuthorizationCode(code) {
        const body = new URLSearchParams();
        body.set("grant_type", "authorization_code");
        body.set("code", code);
        body.set("redirect_uri", this.redirectURI);
        body.set("client_id", this.clientId);
        const clientSecret = await this.createClientSecret();
        body.set("client_secret", clientSecret);
        const request = createOAuth2Request(tokenEndpoint, body);
        const tokens = await sendTokenRequest(request);
        return tokens;
    }
    async createClientSecret() {
        const privateKey = await crypto.subtle.importKey("pkcs8", this.pkcs8PrivateKey, {
            name: "ECDSA",
            namedCurve: "P-256"
        }, false, ["sign"]);
        const now = Math.floor(Date.now() / 1000);
        const headerJSON = JSON.stringify({
            typ: "JWT",
            alg: "ES256",
            kid: this.keyId
        });
        const payloadJSON = JSON.stringify({
            iss: this.teamId,
            exp: now + 5 * 60,
            aud: ["https://appleid.apple.com"],
            sub: this.clientId,
            iat: now
        });
        const signature = new Uint8Array(await crypto.subtle.sign({
            name: "ECDSA",
            hash: "SHA-256"
        }, privateKey, createJWTSignatureMessage(headerJSON, payloadJSON)));
        const jwt = encodeJWT(headerJSON, payloadJSON, signature);
        return jwt;
    }
}
