import { afterEach, describe, expect, it, vi } from "vitest";

const load = async (databaseUrl: string | undefined) => {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", databaseUrl);
  return (await import("./lambda.ts")).handler;
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("worker Lambda handler", () => {
  it("refuses to start without DATABASE_URL", async () => {
    await expect(load(undefined)).rejects.toThrow("DATABASE_URL is not set");
  });

  it("runs the slices' handlers: a batch-text.generate record reaches its handler, which rejects a bad payload", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = await load("postgres://nobody@127.0.0.1:1/none");
    const body = JSON.stringify({ name: "batch-text.generate", payload: { learnerId: "not-a-learner" } });
    expect(await handler({ Records: [{ messageId: "m1", body }] })).toEqual({ batchItemFailures: [{ itemIdentifier: "m1" }] });
    expect(String(errors.mock.calls[0]?.[1])).not.toContain("no handler");
  });

  it("reports a job no slice handles as failed, so SQS retries it and then dead-letters it", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = await load("postgres://nobody@127.0.0.1:1/none");
    const body = JSON.stringify({ name: "nobody.handles-this", payload: {} });
    expect(await handler({ Records: [{ messageId: "m2", body }] })).toEqual({ batchItemFailures: [{ itemIdentifier: "m2" }] });
    expect(String(errors.mock.calls[0]?.[1])).toContain("no handler for job nobody.handles-this");
  });

  it("reads its secrets from SSM at cold start, into the environment the slices read", async () => {
    vi.doMock("@aws-sdk/client-ssm", () => ({
      GetParametersByPathCommand: class {
        constructor(readonly input: { Path: string }) {}
      },
      SSMClient: class {
        send = async ({ input }: { input: { Path: string } }) => ({ Parameters: [{ Name: `${input.Path}/ANTHROPIC_API_KEY`, Value: "sk-from-ssm" }] });
      },
    }));
    vi.stubEnv("SSM_PARAMETER_PATH", "/ibbun/test");
    vi.stubEnv("ANTHROPIC_API_KEY", "stale");
    await load("postgres://nobody@127.0.0.1:1/none");
    expect(process.env.ANTHROPIC_API_KEY).toBe("sk-from-ssm");
    vi.doUnmock("@aws-sdk/client-ssm");
  });
});
