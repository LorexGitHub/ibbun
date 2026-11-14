# account

A visitor signs up with an email and password, verifies the address through a mailed link, logs in and out, and resets a forgotten password. A Learner changes their email or password, sees and ends their sessions, sets their preferences (furigana, English and Japanese explanations, never both off) and deletes their account. Sign-up, login and reset never say whether an address has an account ([accounts.md](../../../../docs/accounts.md)).

## Sub-features

- `account-welcome` a visitor at `/` meets the sign-up split: an accent panel with 一文ずつ。 set upright, the sign-up form beside it, "Log in" and "Try one Review first" under it, then "What's inside". `/login` uses the same split.
- `account-try` `/try` is one Review for a visitor: 水を飲みます。 and "What does 水 mean?". "Check" answers "Correct." or "Not quite." with "水 (みず) means water." and the button "Sign up to keep going" leads to `/signup`. Nothing is saved.
- `account-signup` `/signup` always answers "Check your email"; a new address gets a verify mail, an existing one gets "already registered"; the link works once and logs nobody in.
- `account-login` `/login` gives one failure message, "email or password is wrong", for an unknown address, a wrong password and an unverified account.
- `account-reset` `/forgot-password` always answers "If that address has an account, we sent a link"; `/reset-password?token=…` sets a new password and ends every session.
- `account-settings` `/settings` uses the width: the columns Look, Study and Account side by side and a Devices pane on the right whose list scrolls by itself. Under 1100px there are two columns, under 700px one. Change email (mail to the new address first), change password (other sessions end), list and end sessions, log out, log out everywhere.
- `account-preferences` the preference controls in the Study column, saved at once with the notice "Saved." and no Save button; the last explanation toggle cannot be turned off.
- `account-delete` "Delete my account" with the password hard-deletes the Learner.
- `account-rate-limit` login is limited to 5 tries per 15 min per email and IP; sign-up, reset and resend to 3 per hour per IP; the blocked call is `429` with `Retry-After`.
- `account-guest` with `SHOWCASE=1`, "Try it" on `/signup` signs a visitor in as a guest and opens `/learn` with no mail sent; sign-up by email is refused; 10 guests per hour per IP, then `429`; guests older than 24 hours are deleted on the next guest login. Without `SHOWCASE=1` the button shows an error.
- `account-roles` the `learner` and `supervisor` seed accounts; `/admin` needs `supervisor`.

## How to get to it (user POV)

- Open `http://localhost:5173/signup`, `/login`, `/forgot-password` or `/settings`. The account menu (the initial at the top right) has a Settings link.
- Verification and reset links arrive in Mailpit at `http://localhost:8025`. Leave `MAIL_TRANSPORT` unset; `MAIL_TRANSPORT=ses` sends through SES instead and nothing reaches Mailpit.
- Without a session, `/settings` sends the visitor to `/login`.

## Driving it with Playwright

Preconditions:

- `verify.sh up` ran on the branch; it seeds `learner@ibbun.test` (password `learner-password`) and `supervisor@ibbun.test` (`supervisor-password`).
- Use a fresh browser context per journey unless the step says otherwise. Use a fresh address such as `v1@ibbun.test` per sign-up.
- Limit steps (`account-rate-limit`) use addresses and a client IP of their own; do them last, because they burn the 3-per-hour budget of that IP.

- **Sign up and verify.** Open `/signup`, fill Email and Password (12+ characters), press "Sign up". Expect a status "Check your email". Follow the link from `curl -s "http://localhost:8025/api/v1/search?query=to:v1@ibbun.test"` then `GET /api/v1/message/<ID>`. Expect the URL `/login?verified=1` and "Email verified". Log in; expect to leave `/login`. Read-only view: `docker compose -p ibbun-verify exec postgres psql -U ibbun -c "select email, email_verified from learner.learners where email='v1@ibbun.test'"` shows verified.
- **Welcome and one Review.** In a fresh context open `/`. Expect the accent panel with 一文ずつ。 upright on the left and the sign-up form on the right; at 400px wide the panel lies across the top. Click "Try one Review first", answer `water`, press "Check": the status reads "Correct. 水 (みず) means water.". Reload `/try`, answer `fire`: "Not quite. 水 (みず) means water.". "Sign up to keep going" opens `/signup`. The EDRDG line is in the footer of each of these screens. `verify.sh shot / account/welcome`.
- **Unverified cannot log in.** Sign up `v2@ibbun.test`, do not open the link, log in. Expect the alert "email or password is wrong".
- **Enumeration-safe sign-up.** Sign up `learner@ibbun.test` again. Expect the same status text as for a new address; Mailpit shows an "already registered" mail to it and no new row appears in `learner.learners`.
- **Enumeration-safe login.** Log in as `nobody@ibbun.test`, then as `learner@ibbun.test` with a wrong password. Both show exactly "email or password is wrong".
- **Link works once.** Open the verify link of `v1` a second time; expect an error, not a session.
- **Password reset.** Open `/forgot-password`, enter `learner@ibbun.test`, then `nobody@ibbun.test`. Both show "If that address has an account, we sent a link."; Mailpit has one reset mail, for the first. Open its link, choose a new password, expect `/login?reset=1`; log in with the new password. Open the link again; expect "invalid token". Run `verify.sh shot /login account/reset-login`.
- **Settings.** Log in as `learner@ibbun.test`, open `/settings`. At 1280px wide expect four tops in one row: Look (five looks with live swatches, then Light, Dark and Match my device), Study (the preference controls), Account (the email, the two forms, "Log out", "Delete account") and the Devices pane with a session marked "(this device)" and "Log out everywhere". With more sessions than fit, the list scrolls inside the pane and the page does not grow. No screen width scrolls sideways. `verify.sh shot /settings account/settings`.
- **Preferences and the toggle rule.** On `/settings` the English translation box is checked and disabled while Japanese is off. Check "Show the Japanese Explanation": "Saved." appears and English becomes enabled. Reload: Japanese is still checked (read-only view: `select explanations from learner.preferences`). Uncheck English: Japanese becomes disabled. No click can leave both off.
- **Sessions.** Log in from two contexts as the same Learner. In one, `/settings` lists two sessions; "End session" on the other; reload the other context and expect `/login`.
- **Log out everywhere.** With two contexts logged in, press "Log out everywhere" in one. Expect `/login` there and, after reload, in the other.
- **Change password ends other sessions.** With two contexts logged in, change the password in one; the other is logged out on reload, the first stays.
- **Change email.** Enter a new address and press "Change email". Expect the status; Mailpit has a verify mail to the new address; the old address still logs in until the link is opened; after it, only the new address logs in and the old address got an "email changed" mail.
- **Rate limiting.** Post six wrong logins for one address in a row (`curl -s -o /dev/null -w '%{http_code}\n' -H 'content-type: application/json' -H 'origin: http://localhost:5173' -d '{"email":"rl@ibbun.test","password":"x"}' http://localhost:5173/api/auth/sign-in/email`). Expect five `401`, then `429` with a `Retry-After` header (`curl -i`). Request sign-up four times from one client; the fourth is `429`.
- **Deletion.** Sign up and verify `v3@ibbun.test`, log in, open `/settings`, enter the password under "Password to confirm", press "Delete my account". Expect `/signup`, a mail "Your ibbun account was deleted", and the address can no longer log in. Read-only view: `select count(*) from learner.learners where email='v3@ibbun.test'` is 0, and the same for `learner.sessions` and `learner.login_methods` by Learner ID noted before deleting. A wrong password keeps the account and shows an alert.
- **Roles.** `curl -s -b <cookie jar> http://localhost:5173/api/auth/get-session` after logging in as each seed account: the `user.role` is `learner` and `supervisor`. The `/admin` screens belong to the admin slices; until one mounts `requireRole('supervisor')` there is no `/admin` route to hit, so report the `/admin` step as skipped with that reason, never as passed. Once one exists, expect the Learner to get `403` and the Supervisor `200`.
- **Harness spec.** `env -u CI pnpm exec playwright test --project=learner slices/account/tests` passes.

## Gotchas

- The session cookie is `Secure`; Chromium accepts it on `http://localhost`, curl needs `-c`/`-b` jars and does not drop it.
- Every state-changing call needs `Origin: http://localhost:5173`, or Better Auth answers 403.
- Rate-limit counters live in Postgres and survive restarts. `verify.sh down -v` clears them; otherwise use new addresses.
- The "log out everywhere" and password-change steps end the stored Playwright session of `learner@ibbun.test`; do them with a Learner made for the step, not the seed account the `setup` project logged in.
- Verification mail links point at `APP_URL` (`http://localhost:5173`).
