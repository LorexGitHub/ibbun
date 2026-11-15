import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withBodyHash } from "./body-hash.ts";

const ORIGIN = "https://mojibun.example";
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/** Sends through `withBodyHash` and returns the request that would have gone out. */
const sent = async (input: string, init?: RequestInit) => {
  let out: Request | undefined;
  await withBodyHash(async (request) => {
    out = request as Request;
    return new Response();
  }, ORIGIN)(input, init);
  return out!;
};

describe("withBodyHash", () => {
  it("signs a same-origin body with its SHA-256, and the body still arrives whole", async () => {
    const body = JSON.stringify({ answer: "たべる" });
    const request = await sent(`${ORIGIN}/api/learn/answers`, { method: "POST", headers: { "content-type": "application/json" }, body });
    expect(request.headers.get("x-amz-content-sha256")).toBe(sha256(body));
    expect(request.headers.get("content-type")).toBe("application/json");
    expect(await request.text()).toBe(body);
  });

  it("adds nothing to a request without a body", async () => {
    expect((await sent(`${ORIGIN}/api/dashboard/today`)).headers.has("x-amz-content-sha256")).toBe(false);
  });

  it("adds nothing to a cross-origin request, so it needs no preflight for it", async () => {
    const request = await sent("https://elsewhere.example/collect", { method: "POST", body: "x" });
    expect(request.headers.has("x-amz-content-sha256")).toBe(false);
  });
});
