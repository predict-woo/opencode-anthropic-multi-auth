// src/pkce.ts
import { base64url } from "jose";
function generateVerifier(length) {
  const buffer = new Uint8Array(length);
  crypto.getRandomValues(buffer);
  return base64url.encode(buffer);
}
async function generateChallenge(verifier, method) {
  if (method === "plain")
    return verifier;
  const encoder = new TextEncoder;
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return base64url.encode(new Uint8Array(hash));
}
async function generatePKCE(length = 64) {
  if (length < 43 || length > 128) {
    throw new Error("Code verifier length must be between 43 and 128 characters");
  }
  const verifier = generateVerifier(length);
  const challenge = await generateChallenge(verifier, "S256");
  return {
    verifier,
    challenge,
    method: "S256"
  };
}
async function validatePKCE(verifier, challenge, method = "S256") {
  const generatedChallenge = await generateChallenge(verifier, method);
  return generatedChallenge === challenge;
}
export {
  validatePKCE,
  generatePKCE
};
