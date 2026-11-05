// learner/client: the thin typed client the SPA uses for every account action.
// It speaks HTTP to `authHandler`, so slices never import Better Auth.

export type Result<T> = { ok: true; data: T } | { ok: false; status: number; message: string };

export type CurrentLearner = { learnerId: string; email: string; role: "learner" | "supervisor" };

export type ActiveSession = {
  /** Pass to `endSession`. */
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  /** To the day: a session is extended at most once a day. */
  lastUsedAt: string;
  /** The session making this request. */
  current: boolean;
};

export type LearnerClientOptions = {
  /** Defaults to `/api/auth` on the page's own origin. */
  baseUrl?: string;
  fetch?: typeof fetch;
};

type RawSession = { token: string; ipAddress?: string | null; userAgent?: string | null; createdAt: string; updatedAt: string };
type RawGetSession = { session: { token: string }; user: { id: string; email: string; role: CurrentLearner["role"] } } | null;

export const createLearnerClient = ({ baseUrl = "/api/auth", fetch: send = globalThis.fetch }: LearnerClientOptions = {}) => {
  const call = async <T>(path: string, body?: object): Promise<Result<T>> => {
    const response = await send(`${baseUrl}${path}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
    const json = await response.json().catch(() => null);
    if (!response.ok) return { ok: false, status: response.status, message: json?.message ?? response.statusText };
    return { ok: true, data: json as T };
  };
  const done = async (result: Promise<Result<unknown>>): Promise<Result<null>> => {
    const r = await result;
    return r.ok ? { ok: true, data: null } : r;
  };

  return {
    /** Always answers ok for a valid request, whether or not the address has an account. */
    signUp: (email: string, password: string) => done(call("/sign-up/email", { email, password, name: "" })),
    resendVerification: (email: string) => done(call("/send-verification-email", { email })),
    signIn: (email: string, password: string) => done(call("/sign-in/email", { email, password })),
    signOut: () => done(call("/sign-out", {})),
    signOutEverywhere: () => done(call("/revoke-sessions", {})),
    /** `redirectTo` is the SPA page that reads `?token=` and asks for the new password. */
    requestPasswordReset: (email: string, redirectTo = "/reset-password") =>
      done(call("/request-password-reset", { email, redirectTo })),
    resetPassword: (token: string, newPassword: string) => done(call("/reset-password", { token, newPassword })),
    /** Ends every other session. */
    changePassword: (currentPassword: string, newPassword: string) =>
      done(call("/change-password", { currentPassword, newPassword })),
    /** Mails a verification link to the new address. The old one stays in use until then. */
    changeEmail: (newEmail: string) => done(call("/change-email", { newEmail })),
    deleteAccount: (password: string) => done(call("/delete-user", { password })),
    endSession: (id: string) => done(call("/revoke-session", { token: id })),

    async session(): Promise<Result<CurrentLearner | null>> {
      const r = await call<RawGetSession>("/get-session");
      if (!r.ok) return r;
      const user = r.data?.user;
      return { ok: true, data: user ? { learnerId: user.id, email: user.email, role: user.role } : null };
    },

    async listSessions(): Promise<Result<ActiveSession[]>> {
      const [all, mine] = await Promise.all([call<RawSession[]>("/list-sessions"), call<RawGetSession>("/get-session")]);
      if (!all.ok) return all;
      const current = mine.ok ? mine.data?.session.token : undefined;
      return {
        ok: true,
        data: all.data.map((s) => ({
          id: s.token,
          ipAddress: s.ipAddress ?? null,
          userAgent: s.userAgent ?? null,
          createdAt: s.createdAt,
          lastUsedAt: s.updatedAt,
          current: s.token === current,
        })),
      };
    },
  };
};

export type LearnerClient = ReturnType<typeof createLearnerClient>;
