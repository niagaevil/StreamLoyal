import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { OverlayKind, prisma } from "@streamloyal/db";

const hash = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

export function createOverlaySecret() {
  return randomBytes(32).toString("base64url");
}

export function overlayTokenHash(secret: string) {
  return hash(secret);
}

export async function verifyOverlayToken(raw: string, kind?: OverlayKind) {
  const separator = raw.indexOf(".");
  if (separator < 1) return null;
  const id = raw.slice(0, separator);
  const secret = raw.slice(separator + 1);
  const access = await prisma.overlayAccess.findUnique({
    where: { id },
    include: { channel: true },
  });
  if (!access || access.revokedAt || (kind && access.kind !== kind)) return null;

  const actual = Buffer.from(hash(secret), "hex");
  const expected = Buffer.from(access.tokenHash, "hex");
  if (
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  ) {
    return null;
  }
  return access;
}
