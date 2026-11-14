import { describe, expect, it } from "vitest";
import { SHOWCASE_STAGE, stageParts, stageSlug } from "./stage.ts";

describe("stageParts", () => {
  it("leaves out the jobs side in the showcase stage", () => {
    expect(stageParts(SHOWCASE_STAGE)).toEqual({
      showcase: true,
      queue: false,
      worker: false,
      schedules: false,
      containers: false,
      importTask: false,
      mail: false,
    });
  });

  it("deploys everything in the shared stage and in a developer's stage", () => {
    for (const stage of ["prod", "dev_david"]) {
      const parts = stageParts(stage);
      expect(parts.showcase).toBe(false);
      expect(Object.values(parts).filter((on) => !on)).toEqual([false]);
    }
  });
});

describe("stageSlug", () => {
  it("makes a stage name safe for function and bucket names", () => {
    expect(stageSlug("dev_David")).toBe("dev-david");
    expect(stageSlug("_x_")).toBe("x");
    expect(stageSlug("Dev__A.B")).toBe("dev-a-b");
    expect(stageSlug("prod")).toBe("prod");
  });
});
