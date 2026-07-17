import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./crypto";

describe("token encryption", () => {
  it("encrypts with authenticated encryption and decrypts the original value", () => {
    const encrypted = encryptSecret("token-super-secreto");
    expect(encrypted).toMatch(/^enc:v1:/);
    expect(encrypted).not.toContain("token-super-secreto");
    expect(decryptSecret(encrypted)).toBe("token-super-secreto");
  });

  it("keeps compatibility with legacy plaintext values", () => {
    expect(decryptSecret("legacy-token")).toBe("legacy-token");
  });

  it("does not encrypt an already encrypted value twice", () => {
    const encrypted = encryptSecret("token")!;
    expect(encryptSecret(encrypted)).toBe(encrypted);
  });
});
