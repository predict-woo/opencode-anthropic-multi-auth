import { decodeJWT } from "@oslojs/jwt";
export function decodeIdToken(idToken) {
    try {
        return decodeJWT(idToken);
    }
    catch (e) {
        throw new Error("Invalid ID token", {
            cause: e
        });
    }
}
