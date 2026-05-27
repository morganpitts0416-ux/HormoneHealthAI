import crypto from "crypto";

const ALGO = "aes-256-gcm" as const;

function getDerivedKey(): Buffer {
  const secret =
    process.env.OPS_ENCRYPTION_KEY ||
    process.env.SESSION_SECRET ||
    "dev-only-insecure-fallback-do-not-use";
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypt a plaintext string (e.g. MFA secret) with AES-256-GCM.
 * Returns "ivHex:authTagHex:ciphertextHex".
 */
export function encryptOpsSecret(plaintext: string): string {
  const key = getDerivedKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = (cipher as any).getAuthTag() as Buffer;
  return [iv.toString("hex"), authTag.toString("hex"), encrypted.toString("hex")].join(":");
}

/**
 * Decrypt a value produced by encryptOpsSecret.
 * Throws on tampered ciphertext (GCM auth tag verification).
 */
export function decryptOpsSecret(stored: string): string {
  const key = getDerivedKey();
  const parts = stored.split(":");
  if (parts.length !== 3) throw new Error("Invalid ops secret format");
  const [ivHex, authTagHex, encHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encHex, "hex");
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  (decipher as any).setAuthTag(authTag);
  return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
}
