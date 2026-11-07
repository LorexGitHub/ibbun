import * as Cognito from "@alchemy.run/aws/Cognito";
import * as Effect from "effect/Effect";

// Declared once, yielded by both the stack (for outputs) and the API function (to verify tokens).
export const LearnerPool = Effect.gen(function* () {
  const pool = yield* Cognito.UserPool("Learners", {
    usernameAttributes: ["email"],
    autoVerifiedAttributes: ["email"],
    passwordPolicy: { minimumLength: 10 },
    accountRecovery: [{ name: "verified_email", priority: 1 }],
    tier: "LITE",
  });
  const client = yield* Cognito.UserPoolClient("WebClient", {
    userPoolId: pool.userPoolId,
    generateSecret: false,
    explicitAuthFlows: ["ALLOW_USER_SRP_AUTH", "ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
  });
  return { pool, client };
});
