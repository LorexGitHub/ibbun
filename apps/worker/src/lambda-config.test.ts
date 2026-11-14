import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { workerLambda } from "./lambda-config.ts";

const visibilitySeconds = async () => {
  const conf = await readFile(resolve(import.meta.dirname, "../../../docker/elasticmq/elasticmq.conf"), "utf8");
  return Number(/ibbun-jobs \{[^}]*?defaultVisibilityTimeout = (\d+) seconds/.exec(conf)![1]);
};

describe("workerLambda", () => {
  it("runs for Lambda's longest timeout, one job per invocation", () => {
    expect(workerLambda).toMatchObject({ timeoutSeconds: 900, batchSize: 1 });
  });

  it("hides a received job for at least 6 times the timeout, so it is not run twice while running", async () => {
    expect(await visibilitySeconds()).toBeGreaterThanOrEqual(6 * workerLambda.timeoutSeconds);
  });
});
