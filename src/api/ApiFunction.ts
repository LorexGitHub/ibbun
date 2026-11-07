import * as Lambda from "@alchemy.run/aws/Lambda";
import { Stack } from "alchemy/Stack";
import * as Effect from "effect/Effect";
import * as Etag from "effect/http/Etag";
import * as HttpPlatform from "effect/http/HttpPlatform";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import * as Layer from "effect/Layer";
import { LearnerAuth, LearnerAuthCognito } from "../auth/LearnerAuth.ts";
import { LearnerApi } from "./LearnerApi.ts";
import { LearnerStore, LearnerStoreDynamoDB } from "./LearnerStore.ts";

// A fixed name per stage lets the stack predict the emulator's function URL, see alchemy.run.ts.
export const apiFunctionName = (stage: string) => `mojibun-${stage}-api`;

const LearnerApiLive = HttpApiBuilder.layer(LearnerApi).pipe(
  Layer.provide(
    HttpApiBuilder.group(LearnerApi, "learner", (handlers) =>
      Effect.gen(function* () {
        const store = yield* LearnerStore;
        const { learnerId } = yield* LearnerAuth;
        return handlers
          .handle("health", () => Effect.succeed({ ok: true }))
          .handle("listItems", ({ headers }) =>
            learnerId(headers.authorization).pipe(
              Effect.flatMap((learner) => store.listItems(learner)),
              Effect.map((items) => ({ items })),
              Effect.catchTag("LearnerStoreError", Effect.die),
            ),
          )
          .handle("setKnown", ({ headers, params, payload }) =>
            learnerId(headers.authorization).pipe(
              Effect.flatMap((learner) => store.setKnown(learner, params.kind, params.id, payload.known)),
              Effect.catchTag("LearnerStoreError", Effect.die),
            ),
          )
          .handle("recordReview", ({ headers, payload }) =>
            Effect.gen(function* () {
              const learner = yield* learnerId(headers.authorization);
              const at = new Date().toISOString();
              yield* store.recordReview(learner, payload, at).pipe(Effect.catchTag("LearnerStoreError", Effect.die));
              return { ...payload, at };
            }),
          );
      }),
    ),
  ),
);

export default class ApiFunction extends Lambda.Function<ApiFunction>()(
  "ApiFunction",
  Stack.useSync((stack) => ({
    main: import.meta.url,
    functionName: apiFunctionName(stack.stage),
    // Public URL behind the CloudFront router. Every /api/me handler verifies the Cognito token itself.
    functionUrl: true,
    memorySize: 256,
    logging: { retention: "2 weeks" },
  })),
  HttpRouter.toHttpEffect(LearnerApiLive).pipe(
    Effect.map((fetch) => ({ fetch })),
    Effect.provide(Layer.mergeAll(LearnerStoreDynamoDB, LearnerAuthCognito, HttpPlatform.layer, Etag.layer)),
  ),
) {}
