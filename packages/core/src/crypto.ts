import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const PREFIX = "enc:v1:";

function key() {
  const source = process.env.TOKEN_ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!source && process.env.NODE_ENV === "production") {
    throw new Error("TOKEN_ENCRYPTION_KEY é obrigatório em produção");
  }
  return createHash("sha256")
    .update(source || "streamloyal-development-only")
    .digest();
}

export function encryptSecret(value: string | null | undefined) {
  if (!value || value.startsWith(PREFIX)) return value ?? null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptSecret(value: string | null | undefined) {
  if (!value) return null;
  // Compatibilidade para migrar instalações antigas: tokens em texto puro
  // continuam legíveis e são criptografados na próxima renovação.
  if (!value.startsWith(PREFIX)) return value;
  const [ivRaw, tagRaw, encryptedRaw] = value.slice(PREFIX.length).split(":");
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error("Token criptografado inválido");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(ivRaw, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
