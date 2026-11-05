# Accounts, sessions and roles

Decided in [#39](https://github.com/LorexGitHub/mojibun/issues/39). Terms follow [CONTEXT.md](../CONTEXT.md). Why sign-up is open is in [ADR 0012](adr/0012-open-sign-up-bounded-by-token-quotas.md). [#6](https://github.com/LorexGitHub/mojibun/issues/6) set multi-user from day one and no payments.

## Summary

- Open sign-up with email and password. A Learner must verify their email before they can log in.
- [Better Auth](https://better-auth.com) runs inside core `learner`. Nothing else imports it.
- An httpOnly cookie points to a row in a Postgres session table. A session lasts 30 days, and each use extends it.
- Passwords are hashed with argon2id, must be 12–128 characters, and are checked against breached passwords.
- There are two roles, `learner` and `supervisor`. A Supervisor is also a Learner.
- Batch Text quotas per Learner and per pool keep open sign-up from using up the shared LLM budget.
- Mailpit in Docker Compose catches all mail locally.
- OAuth and passkeys come later as extra login methods, with no data migration.

## Sign-up and login

1. **Sign-up** takes an email and a password. It always answers "check your email", whether or not the address already has an account.
   - For a new address, mojibun sends a verification link.
   - For an existing address, mojibun sends "you already have an account; reset your password?" and creates nothing.
2. **Verification** is required. Until the Learner verifies, they can't log in. The link expires after **24 h**, can be resent, and works once.
3. **Login** takes an email and a password. Every failure gives the same message, "email or password is wrong", including for unverified and deactivated accounts. The message never says which part was wrong.
4. **Password reset** always answers "if that address has an account, we sent a link". The link expires after **1 h** and works once. A reset ends every session of that Learner.
5. **Changing the email** sends a verification link to the new address. The old address stays in use until the Learner verifies the new one.

When `SIGNUP_OPEN` (config, default `true`) is `false`, sign-up is refused. Existing Learners can still log in. The supervisor can use this switch to stop abuse at once.

## Security standards

The rules follow OWASP (Password Storage and Authentication Cheat Sheets) and NIST SP 800-63B.

| Topic | Rule |
|---|---|
| Password hashing | argon2id through `@node-rs/argon2`, m = 19 MiB, t = 2, p = 1 (OWASP minimum), plugged into Better Auth's custom hash and verify hooks. Each hash stores its parameters, so stronger settings later are applied when the Learner next logs in |
| Password rules | 12 to 128 characters, any Unicode, no composition rules, no forced rotation. Paste and password managers are allowed |
| Breached passwords | Every new or changed password is checked against Have I Been Pwned's k-anonymity range API (Better Auth `haveIBeenPwned` plugin). Only the first 5 characters of the SHA-1 hash leave the server. A password found in a breach is refused with a clear message |
| Tokens | Verification and reset tokens are random, stored only as hashes, work once, and expire (24 h and 1 h) |
| Rate limits | Login: 5 tries per 15 min per email and per IP. Sign-up, reset and resending verification: 3 per hour per IP. Limits are stored in Postgres, so they survive restarts. A blocked request gets `429` with `Retry-After` |
| Enumeration | Sign-up, login and reset never say whether an email has an account (see above) |
| Session cookie | `httpOnly`, `Secure`, `SameSite=Lax`, host-only. Holds an opaque session ID only, never a JWT |
| CSRF | `SameSite=Lax` plus Better Auth's origin check on every state-changing request. The SPA and the API share one origin, so no CORS |
| Secrets | The auth secret comes from the environment and is never committed. CI fails if it is missing or shorter than 32 bytes |
| Logs | Passwords, tokens and session IDs are never logged. Auth events (sign-up, login success and failure, reset, role change, deactivation) are logged with Learner ID and IP |

## Sessions

- One row per session in a Postgres table in the `learner` schema: Learner, hashed token, created, last used, expires, IP, user agent.
- A session lasts **30 days**. A request extends it, at most once a day.
- **Log out** deletes the current session. **Log out everywhere**, a password change and a password reset delete all of the Learner's sessions; a password change keeps only the current one.
- Settings list the Learner's active sessions (device and last used), and each can be ended on its own.

## Roles

| Role | Can |
|---|---|
| `learner` | Everything Learner-facing |
| `supervisor` | Everything a Learner can do, plus `/admin`: escalations, samples, pause and resume, budget and pool spend, deactivating accounts |

- Every account has exactly one role. New accounts get `learner`.
- There is no screen for granting roles. The seed makes the account for `SUPERVISOR_EMAIL` (env) a Supervisor. A further Supervisor is added with a CLI command: `pnpm --filter @mojibun/learner grant-supervisor <email>`. Every role change is logged.
- The reviewer agent and the verifier agent aren't accounts. Approval Decisions still name the reviewer's model and rubric ([content-approval.md](content-approval.md)).

## LLM quotas

Open sign-up means Learners trigger LLM spend: every Learn batch asks for a Batch Text ([batch-text.md](batch-text.md)). Two limits keep that spend bounded and protect Content Approval. Both are config values.

- **Per Learner:** at most **5 Batch Texts** in any rolling 24 h. `learn` checks the count through `progress` before it enqueues `batch-text.generate`. Over the limit, Learn works as normal, but the batch has no Batch Text and nothing is enqueued. The next Batch Text continues the story from the last episode.
- **Per pool:** the daily token budget ([content-approval.md](content-approval.md#budget)) has two pools. Batch Texts, including the reviewer calls that judge them, may use at most **50%**. All other generation and review keep the rest. When the Batch Text pool is spent, Batch Text generation stops for the day, and other work carries on.

`/admin` shows the day's spend per pool. A `budget exhausted` alert names the pool.

## Deactivating and deleting

- **Deactivate** (Supervisor, from `/admin`): the account's sessions end and it can't log in. Its data stays. A Supervisor can reactivate it.
- **Delete** (the Learner, from settings, after entering their password again): every Learner-owned row is hard-deleted: account, sessions, preferences, Reviews, Mastery projections, Batch Text records, story state, Learning Path seed and Tracks. Batch Text Reading Passages stay in the Content Graph as shared content, because they hold no personal data. Learner answer flags in Content Approval stay, with the author cleared.
- Tables in other packages that hold Learner data reference `learner`'s Learner ID with `ON DELETE CASCADE`. Answer flags use `ON DELETE SET NULL`. A contract test in each package checks that deleting a Learner leaves none of their rows behind.
- There's no data export in v1.

## Email

- A new platform package, `mail`, sends a named template with data. Like the other adapters, it has an interface and a fake.
- Locally, Docker Compose runs **Mailpit**, and `mail` sends to it over SMTP. The verifier agent and Playwright read verification and reset links from Mailpit's API.
- A real SMTP transport is config for the later AWS plan.
- Templates: verify email, already registered, reset password, email changed (sent to the old address), account deleted.

## Wiring

| Where | Does |
|---|---|
| core `learner` | Better Auth with the Drizzle adapter. Its tables (Learner, login methods, sessions, verification tokens, rate limits) live in the `learner` Postgres schema, under `learner`'s migrations. Exports `authHandler` (the api shell mounts it at `/api/auth/*`), a `SessionResolver`, `learner/client` (a thin typed client for the SPA), and identity, role and preference reads and writes. Sends mail through `mail` |
| `platform/auth` | Hono middleware `requireLearner()` and `requireRole('supervisor')`, written against the `SessionResolver` interface, so platform never imports core. The api shell passes `learner`'s resolver in |
| `platform/mail` | Template sending, the SMTP transport, the fake |
| `account` slice | Sign-up, verify, login, reset, settings (email, password, sessions, delete) and the Learner preferences screens. Imports `learner/client`, never Better Auth |
| `apps/web` | Routes under `/admin` need the `supervisor` role. Everything else except the account screens needs a session |
| `learn` slice | Checks the quota per Learner before enqueuing a Batch Text |
| `content-generation` slice | Checks the pool before every Batch Text call |

Slices never import `better-auth`. dependency-cruiser enforces this, so swapping the library later changes only `learner`.

## Later: OAuth and passkeys

One Learner can already have several login methods (Better Auth's account table, with password as one provider).

- **OAuth** (Google, GitHub) is added as a provider. A sign-in links to the existing Learner only when the provider reports a verified email that matches.
- **Passkeys** come through Better Auth's passkey plugin as an extra login method, added from settings.

Neither needs a data migration.

## Testing

- The seed creates two verified accounts in dev and CI only: `learner@mojibun.test` and `supervisor@mojibun.test`, with passwords from env. Production builds refuse to run that part of the seed.
- The app has no auth bypass. Playwright logs in once through the real form and reuses the stored session state.
- `verify-mojibun` covers sign-up through Mailpit, the enumeration-safe responses, rate limiting, log out everywhere, the `/admin` role check and account deletion.
