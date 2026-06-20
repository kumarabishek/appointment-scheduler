/** Field-level encryption for PHI at rest (insurance details).
 *
 * Uses AES-256-GCM with a key derived from PHI_ENCRYPTION_KEY. Encrypted values
 * are tagged with a version prefix so we can tell plaintext from ciphertext and
 * stay backward-compatible with already-stored records.
 *
 * No key set? encrypt/decrypt become no-ops (values stored as-is). That keeps
 * local dev frictionless — but DON'T run without a key when real PHI is involved.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

import { config } from "./config";

const PREFIX = "enc:v1:";

/** 32-byte key from the configured secret (any string works; we hash to 32B). */
function key(): Buffer | null {
  if (!config.phiEncryptionKey) return null;
  return createHash("sha256").update(config.phiEncryptionKey).digest();
}

export function phiEncryptionEnabled(): boolean {
  return Boolean(config.phiEncryptionKey);
}

/** Encrypt a single field. Returns input unchanged if empty, already encrypted,
 *  or no key is configured. */
export function encryptField<T extends string | null | undefined>(plain: T): T {
  if (!plain || (plain as string).startsWith(PREFIX)) return plain;
  const k = key();
  if (!k) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([cipher.update(plain as string, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return (PREFIX + Buffer.concat([iv, tag, ct]).toString("base64")) as T;
}

/** Reverse encryptField. Returns input unchanged if it isn't encrypted or no
 *  key is configured. */
export function decryptField<T extends string | null | undefined>(value: T): T {
  if (!value || !(value as string).startsWith(PREFIX)) return value;
  const k = key();
  if (!k) return value;
  const buf = Buffer.from((value as string).slice(PREFIX.length), "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", k, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8") as T;
}
