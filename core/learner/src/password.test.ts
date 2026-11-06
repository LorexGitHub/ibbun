import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.ts";

describe("password hashing", () => {
  it("hashes with argon2id at the OWASP minimum, and keeps the parameters in the hash", async () => {
    expect(await hashPassword("correct horse battery")).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same password here")).not.toBe(await hashPassword("same password here"));
  });

  it("verifies the right password and refuses a wrong one", async () => {
    const hash = await hashPassword("ねこがすきです、とても");
    expect(await verifyPassword({ hash, password: "ねこがすきです、とても" })).toBe(true);
    expect(await verifyPassword({ hash, password: "ねこがすきです、とても!" })).toBe(false);
  });
});
