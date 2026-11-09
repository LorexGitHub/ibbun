import { describe, expect, it } from "vitest";
import slice from "../register.ts";

describe("the account slice", () => {
  it("registers a Settings nav entry and the sign-up, login, reset and settings screens", async () => {
    expect(slice.name).toBe("account");
    expect(slice.nav).toMatchObject({ label: "Settings", path: "/settings", place: "account" });
    const part = await slice.web!();
    expect(part.routes!.map((r) => r.path)).toEqual(["/signup", "/login", "/forgot-password", "/reset-password", "/settings"]);
  });
});
