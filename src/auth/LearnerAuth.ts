import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as HttpApiError from "effect/http-api/HttpApiError";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { LearnerPool } from "./LearnerPool.ts";

export class LearnerAuth extends Context.Service<
  LearnerAuth,
  {
    /** Verifies a Cognito ID token from an Authorization header and returns the Learner id (`sub`). */
    learnerId(authorization: string | undefined): Effect.Effect<string, HttpApiError.Unauthorized>;
  }
>()("LearnerAuth") {}

export const LearnerAuthCognito = Layer.effect(
  LearnerAuth,
  Effect.gen(function* () {
    const { pool, client } = yield* LearnerPool;
    const poolId = yield* pool.userPoolId;
    const clientId = yield* client.clientId;

    // Runs once per Lambda sandbox, on first use.
    const verifier = yield* Effect.cached(
      Effect.gen(function* () {
        const id = yield* poolId;
        // Cognito and the local emulator both sign tokens with this issuer.
        const issuer = `https://cognito-idp.${id.split("_")[0]}.amazonaws.com/${id}`;
        // Locally the keys are served by the emulator, which sets AWS_ENDPOINT_URL in the container.
        const endpoint = yield* Config.option(Config.String("AWS_ENDPOINT_URL")).pipe(Effect.orDie);
        const jwksUrl = Option.match(endpoint, {
          onNone: () => `${issuer}/.well-known/jwks.json`,
          onSome: (base) => `${base}/${id}/.well-known/jwks.json`,
        });
        return { issuer, audience: yield* clientId, keys: createRemoteJWKSet(new URL(jwksUrl)) };
      }),
    );

    return LearnerAuth.of({
      learnerId: (authorization) =>
        Effect.gen(function* () {
          const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
          if (!token) return yield* new HttpApiError.Unauthorized();
          const { issuer, audience, keys } = yield* verifier;
          const { payload } = yield* Effect.tryPromise(() => jwtVerify(token, keys, { issuer, audience })).pipe(
            Effect.mapError(() => new HttpApiError.Unauthorized()),
          );
          if (payload.token_use !== "id" || typeof payload.sub !== "string") {
            return yield* new HttpApiError.Unauthorized();
          }
          return payload.sub;
        }),
    });
  }),
);
