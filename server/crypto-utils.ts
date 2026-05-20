/**
 * Lightweight AES-256-GCM encrypt/decrypt for per-clinic secrets stored in DB.
 *
 * Key derivation: SHA-256(SESSION_SECRET) → 32-byte key.
 * Storage format: base64(iv) + ":" + base64(authTag) + ":" + base64(ciphertext)
 *
 * Usage:
 *   const enc = encryptSecret("my-api-token");
 *   const plain = decryptSecret(enc);
 */
import crypto from "crypto";

const ALG = "aes-256-gcm";

function derivedKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    console.warn("[crypto-utils] SESSION_SECRET not set — using insecure fallback key. Set SESSION_SECRET in production.");
  }
  return crypto
    .createHash("sha256")
    .update(secret ?? "cliniq-dev-fallback-key-set-SESSION_SECRET-in-prod")
    .digest();
}

export function encryptSecret(plaintext: string): string {
  const key = derivedKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptSecret(ciphertext: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted secret format");
  const [ivB64, tagB64, encB64] = parts;
  const key = derivedKey();
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const encrypted = Buffer.from(encB64, "base64");
  const decipher = crypto.createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
}

/** Returns true if value looks like an encrypted blob (non-empty, colon-delimited). */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.split(":").length === 3;
}
