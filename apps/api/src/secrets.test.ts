import { GetParametersByPathCommand } from "@aws-sdk/client-ssm";
import { describe, expect, it } from "vitest";
import { ssmParameters, withSecrets, type ReadParameters } from "./secrets.ts";

const store: ReadParameters = async (path) => [
  { name: `${path}/AUTH_SECRET`, value: "from-ssm" },
  { name: `${path}/ANTHROPIC_API_KEY`, value: "sk-test" },
];

describe("secrets from SSM", () => {
  it("adds every parameter under SSM_PARAMETER_PATH, named by its last segment, over the environment", async () => {
    const env = await withSecrets({ SSM_PARAMETER_PATH: "/mojibun/prod", AUTH_SECRET: "stale", APP_URL: "https://m.example" }, store);
    expect(env).toEqual({
      SSM_PARAMETER_PATH: "/mojibun/prod",
      AUTH_SECRET: "from-ssm",
      ANTHROPIC_API_KEY: "sk-test",
      APP_URL: "https://m.example",
    });
  });

  it("leaves the environment alone and asks SSM nothing without a path", async () => {
    const env = { AUTH_SECRET: "local" };
    expect(await withSecrets(env, () => Promise.reject(new Error("asked SSM")))).toBe(env);
  });

  it("reads every page of the path, decrypted", async () => {
    const sent: unknown[] = [];
    const pages = [
      { Parameters: [{ Name: "/p/A", Value: "1" }], NextToken: "t1" },
      { Parameters: [{ Name: "/p/B", Value: "2" }] },
    ];
    const read = ssmParameters({
      send: async (command: GetParametersByPathCommand) => {
        sent.push(command.input);
        return pages.shift()!;
      },
    } as never);
    expect(await read("/p")).toEqual([
      { name: "/p/A", value: "1" },
      { name: "/p/B", value: "2" },
    ]);
    expect(sent).toEqual([
      { Path: "/p", WithDecryption: true, NextToken: undefined },
      { Path: "/p", WithDecryption: true, NextToken: "t1" },
    ]);
  });

  it("reads an empty path as no parameters", async () => {
    expect(await ssmParameters({ send: async () => ({}) } as never)("/empty")).toEqual([]);
  });
});
