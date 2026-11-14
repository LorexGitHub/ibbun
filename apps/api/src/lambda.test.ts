import { describe, expect, it, vi } from "vitest";

// The Lambda entry point, cold-started as Lambda would: a function URL event in, a result out.
// The database is never reached: /api/health does not touch it.
vi.stubEnv("DATABASE_URL", "postgres://nobody@127.0.0.1:1/none");
vi.stubEnv("AUTH_SECRET", "lambda-test-secret-0123456789abcdef");
vi.stubEnv("APP_URL", "https://mojibun.example");
vi.stubEnv("SSM_PARAMETER_PATH", "");

const urlEvent = (rawPath: string) => ({
  version: "2.0",
  rawPath,
  rawQueryString: "",
  headers: { host: "abc123.lambda-url.eu-central-1.on.aws" },
  requestContext: { http: { method: "GET", path: rawPath, sourceIp: "203.0.113.9" }, domainName: "abc123.lambda-url.eu-central-1.on.aws" },
  isBase64Encoded: false,
});

describe("lambda handler", () => {
  it("answers a function URL event", async () => {
    const { handler } = await import("./lambda.ts");
    const result = await handler(urlEvent("/api/health") as never, {} as never);
    expect(result).toMatchObject({ statusCode: 200, body: JSON.stringify({ ok: true }) });
  });

});
