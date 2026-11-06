import { z } from "zod";

const Env = z.object({
  AUTH_SECRET: z
    .string({ error: "AUTH_SECRET is not set" })
    .refine((s) => Buffer.byteLength(s, "utf8") >= 32, "AUTH_SECRET must be at least 32 bytes"),
  /** The one origin the SPA and the API share, for example http://localhost:5173. */
  APP_URL: z.url({ error: "APP_URL must be a URL" }).transform((url) => new URL(url).origin),
  SIGNUP_OPEN: z.enum(["true", "false"]).default("true"),
});

export type LearnerConfig = {
  secret: string;
  appUrl: string;
  /** When false, sign-up is refused. Existing Learners still log in. */
  signupOpen: boolean;
};

/** Reads the config from the environment. Throws, naming every problem, when it is missing or invalid. */
export const learnerConfigFromEnv = (env: Record<string, string | undefined>): LearnerConfig => {
  const parsed = Env.safeParse(env);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  return { secret: parsed.data.AUTH_SECRET, appUrl: parsed.data.APP_URL, signupOpen: parsed.data.SIGNUP_OPEN === "true" };
};
