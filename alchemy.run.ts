import { createHash } from "node:crypto";
import * as AWS from "@alchemy.run/aws";
import * as Alchemy from "alchemy";
import * as Output from "alchemy/Output";
import { Stack } from "alchemy/Stack";
import * as Effect from "effect/Effect";
import ApiFunction, { apiFunctionName } from "./src/api/ApiFunction.ts";
import { LearnerPool } from "./src/auth/LearnerPool.ts";

// The local emulator's CloudFront only proxies to localhost:<port> origins, not to the
// <id>.lambda-url.<region>.localhost hostnames it gives functions. It also serves each function
// at localhost:4566/lambda-url/<id>/, where <id> is a name-based UUID of account, region and
// function name. The router's rewrite must be a fixed string, so the id is derived here.
const localFunctionUrlId = (region: string, functionName: string) => {
  const b = createHash("md5").update(`000000000000${region}${functionName}`).digest();
  b[6] = (b[6]! & 0x0f) | 0x30;
  b[8] = (b[8]! & 0x3f) | 0x80;
  return b.toString("hex");
};

export default Alchemy.Stack(
  "mojibun",
  { providers: AWS.providers(), state: Alchemy.localState() },
  Effect.gen(function* () {
    const local = yield* AWS.isLocalEmulator;
    const { region } = yield* AWS.AWSEnvironment.current;
    const { stage } = yield* Stack;
    const { pool, client } = yield* LearnerPool;
    const api = yield* ApiFunction;

    // Content Graph bundles and Listening Clip audio, served under /content.
    const content = yield* AWS.S3.Bucket("Content", { forceDestroy: true });

    // One CloudFront front door: the app, content and API share an origin, so no CORS.
    const router = yield* AWS.Website.Router("Edge", {
      routes: {
        "/api/*": local
          ? {
              url: "http://localhost:4566",
              rewrite: { regex: "^/", to: `/lambda-url/${localFunctionUrlId(region, apiFunctionName(stage))}/` },
            }
          : // ApiFunction sets functionUrl: true, so the URL is always present.
            { url: Output.map(api.functionUrl, (url) => url!) },
        "/content/*": { bucket: content },
      },
      invalidation: { paths: "all" },
    });
    yield* AWS.Website.StaticSite("Web", {
      path: "./web",
      domain: { router },
      forceDestroy: true,
    });

    return {
      url: router.url,
      userPoolId: pool.userPoolId,
      userPoolClientId: client.clientId,
      contentBucket: content.bucketName,
    };
  }),
);
