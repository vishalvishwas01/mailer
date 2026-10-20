import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

function getEncryptionKey(): Buffer {
  const value = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;

  if (!value || !/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(
      "GOOGLE_TOKEN_ENCRYPTION_KEY must be a 64-character hexadecimal key."
    );
  }

  return Buffer.from(value, "hex");
}

export function encryptToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    iv
  );

  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return [
    iv.toString("hex"),
    authTag.toString("hex"),
    encrypted.toString("hex"),
  ].join(":");
}

export function decryptToken(payload: string): string {
  const parts = payload.split(":");

  if (parts.length !== 3) {
    throw new Error("Invalid encrypted token format.");
  }

  const [ivHex, authTagHex, encryptedHex] = parts;

  if (
    !/^[0-9a-f]{24}$/i.test(ivHex) ||
    !/^[0-9a-f]{32}$/i.test(authTagHex) ||
    !/^(?:[0-9a-f]{2})*$/i.test(encryptedHex)
  ) {
    throw new Error("Invalid encrypted token data.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivHex, "hex")
  );

  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, "hex")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}