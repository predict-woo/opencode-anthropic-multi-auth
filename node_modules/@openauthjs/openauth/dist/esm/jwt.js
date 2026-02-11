// src/jwt.ts
import { jwtVerify, SignJWT } from "jose";
var jwt;
((jwt) => {
  function create(payload, algorithm, privateKey) {
    return new SignJWT(payload).setProtectedHeader({ alg: algorithm, typ: "JWT", kid: "sst" }).sign(privateKey);
  }
  jwt.create = create;
  function verify(token, publicKey) {
    return jwtVerify(token, publicKey);
  }
  jwt.verify = verify;
})(jwt ||= {});
export {
  jwt
};
