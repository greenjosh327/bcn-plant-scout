import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

const SEALED_VALUE_VERSION = "v1";

function decodeEncryptionKey(encodedKey: string) {
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) {
    throw new Error("ETSY_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  return key;
}

export function sealSecret(value: string, encodedKey: string) {
  if (!value) throw new Error("Cannot encrypt an empty secret.");

  const initializationVector = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", decodeEncryptionKey(encodedKey), initializationVector);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authenticationTag = cipher.getAuthTag();

  return [
    SEALED_VALUE_VERSION,
    initializationVector.toString("base64url"),
    authenticationTag.toString("base64url"),
    ciphertext.toString("base64url")
  ].join(".");
}

export function openSecret(sealedValue: string, encodedKey: string) {
  const [version, initializationVector, authenticationTag, ciphertext] = sealedValue.split(".");
  if (version !== SEALED_VALUE_VERSION || !initializationVector || !authenticationTag || !ciphertext) {
    throw new Error("Encrypted Etsy credential has an invalid format.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    decodeEncryptionKey(encodedKey),
    Buffer.from(initializationVector, "base64url")
  );
  decipher.setAuthTag(Buffer.from(authenticationTag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

export function createOAuthState() {
  return randomBytes(32).toString("base64url");
}

export function hashOAuthState(state: string) {
  return createHash("sha256").update(state, "utf8").digest("hex");
}

export function oauthStateMatches(state: string, expectedHash: string) {
  const received = Buffer.from(hashOAuthState(state), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function createPkceVerifier() {
  return randomBytes(64).toString("base64url");
}

export function createPkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier, "utf8").digest("base64url");
}
