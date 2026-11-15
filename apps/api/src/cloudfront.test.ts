import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { behindCloudFront, VIEWER_IP_HEADER } from "./cloudfront.ts";

/** An API that echoes what reached it. */
const echo = new Hono().all("*", async (c) =>
  c.json({ url: c.req.url, method: c.req.method, ip: c.req.header("x-forwarded-for") ?? null, body: await c.req.text() }),
);
const viewer = behindCloudFront("https://mojibun.example", echo);

describe("behind CloudFront", () => {
  it("serves each request on the app's origin, whatever host and protocol reached the function URL", async () => {
    const response = await viewer.request("http://abc123.lambda-url.eu-central-1.on.aws/api/auth/sign-in?next=%2Freviews", {
      method: "POST",
      body: "{}",
    });
    expect(await response.json()).toMatchObject({ url: "https://mojibun.example/api/auth/sign-in?next=%2Freviews", method: "POST", body: "{}" });
  });

  it("takes the viewer's IP from the edge's viewer header, not from a forwarded-for the viewer could write", async () => {
    const headers = { "x-forwarded-for": "6.6.6.6, 203.0.113.9", [VIEWER_IP_HEADER]: "203.0.113.9" };
    expect(await (await viewer.request("/api/health", { headers })).json()).toMatchObject({ ip: "203.0.113.9" });
  });

  it("keeps an IPv6 viewer whole", async () => {
    const headers = { [VIEWER_IP_HEADER]: "2001:db8::1" };
    expect(await (await viewer.request("/api/health", { headers })).json()).toMatchObject({ ip: "2001:db8::1" });
  });

  it("drops a forwarded-for that did not come with a viewer IP", async () => {
    expect(await (await viewer.request("/api/health", { headers: { "x-forwarded-for": "6.6.6.6" } })).json()).toMatchObject({ ip: null });
  });
});
