import { describe, expect, it } from "vitest";
import { learnerConfigFromEnv } from "./config.ts";

const env = { AUTH_SECRET: "k".repeat(32), APP_URL: "http://localhost:5173/" };

describe("learnerConfigFromEnv", () => {
  it("reads the secret and the app origin, with sign-up open by default", () => {
    expect(learnerConfigFromEnv(env)).toEqual({ secret: "k".repeat(32), appUrl: "http://localhost:5173", signupOpen: true, showcase: false });
  });

  it("closes sign-up when SIGNUP_OPEN is false", () => {
    expect(learnerConfigFromEnv({ ...env, SIGNUP_OPEN: "false" }).signupOpen).toBe(false);
  });

  it("refuses a missing secret", () => {
    expect(() => learnerConfigFromEnv({ APP_URL: env.APP_URL })).toThrow("AUTH_SECRET is not set");
  });

  it("refuses a secret shorter than 32 bytes, counting bytes not characters", () => {
    expect(() => learnerConfigFromEnv({ ...env, AUTH_SECRET: "k".repeat(31) })).toThrow("at least 32 bytes");
    expect(learnerConfigFromEnv({ ...env, AUTH_SECRET: "鍵".repeat(11) }).secret).toBe("鍵".repeat(11));
  });

  it("refuses a missing app URL and an unknown SIGNUP_OPEN value", () => {
    expect(() => learnerConfigFromEnv({ AUTH_SECRET: env.AUTH_SECRET })).toThrow("APP_URL must be a URL");
    expect(() => learnerConfigFromEnv({ ...env, SIGNUP_OPEN: "yes" })).toThrow();
  });
});
