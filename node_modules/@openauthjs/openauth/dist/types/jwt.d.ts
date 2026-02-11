import { JWTPayload, KeyLike } from "jose";
export declare namespace jwt {
    function create(payload: JWTPayload, algorithm: string, privateKey: KeyLike): Promise<string>;
    function verify<T>(token: string, publicKey: KeyLike): Promise<import("jose").JWTVerifyResult<T>>;
}
//# sourceMappingURL=jwt.d.ts.map