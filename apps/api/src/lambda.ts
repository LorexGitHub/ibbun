import { SSMClient } from "@aws-sdk/client-ssm";
import { handle } from "hono/aws-lambda";
import { createApi } from "./api.ts";
import { behindCloudFront } from "./cloudfront.ts";
import { ssmParameters, withSecrets } from "./secrets.ts";

// Runs once per cold start: secrets come from SSM here, never per request.
// One or two connections per Lambda keep Aurora under its limit (ADR 0015).
const env = await withSecrets(process.env, ssmParameters(new SSMClient({})));
const api = await createApi(env, { poolSize: 2 });

export const handler = handle(behindCloudFront(env.APP_URL!, api));
