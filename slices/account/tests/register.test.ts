import { describe, expect, it } from "vitest";
import slice from "../register.ts";

describe("the account slice", () => {
  it("registers a Settings nav entry, the sign-up, try, login, reset and settings screens and the welcome", async () => {
    expect(slice.name).toBe("account");
    expect(slice.nav).toMatchObject({ label: "Settings", path: "/settings", place: "account" });
    const part = await slice.web!();
    expect(part.routes!.map((r) => r.path)).toEqual(["/signup", "/login", "/try", "/forgot-password", "/reset-password", "/settings"]);
    expect(part.widgets!.map((w) => w.slot)).toEqual(["welcome"]);
  });
});
