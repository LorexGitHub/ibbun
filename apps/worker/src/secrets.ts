import { GetParametersByPathCommand, type SSMClient } from "@aws-sdk/client-ssm";

type Env = Record<string, string | undefined>;

/** Every parameter directly under an SSM path, decrypted, as `{ name, value }` with `name` the full parameter name. */
export type ReadParameters = (path: string) => Promise<{ name: string; value: string }[]>;

/**
 * `env` with the secrets from SSM Parameter Store added: each parameter under
 * `SSM_PARAMETER_PATH` becomes the variable named by its last segment
 * (`/ibbun/prod/ANTHROPIC_API_KEY` → `ANTHROPIC_API_KEY`). Without that path, `env` as it is.
 * A copy of apps/api/src/secrets.ts: apps do not import each other.
 */
export const withSecrets = async (env: Env, read: ReadParameters): Promise<Env> => {
  const path = env.SSM_PARAMETER_PATH;
  if (!path) return env;
  const parameters = await read(path);
  return { ...env, ...Object.fromEntries(parameters.map(({ name, value }) => [name.slice(name.lastIndexOf("/") + 1), value])) };
};

/** `ReadParameters` over the SSM API, following every page. */
export const ssmParameters =
  (ssm: Pick<SSMClient, "send">): ReadParameters =>
  async (path) => {
    const found: { name: string; value: string }[] = [];
    let NextToken: string | undefined;
    do {
      const { Parameters = [], ...page } = await ssm.send(new GetParametersByPathCommand({ Path: path, WithDecryption: true, NextToken }));
      for (const { Name, Value } of Parameters) found.push({ name: Name!, value: Value! });
      NextToken = page.NextToken;
    } while (NextToken);
    return found;
  };
