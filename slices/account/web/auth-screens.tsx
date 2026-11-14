import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { buttonClass } from "@ibbun/ui";
import { useClient } from "./client.ts";
import { Field, Form, Notice, Screen, Split, useOutcome } from "./form.tsx";

const CHECK_YOUR_EMAIL = "Check your email. If the address can sign up, we sent a link to finish.";

export const SignUp = () => {
  const client = useClient();
  const { outcome, run } = useOutcome();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const navigate = useNavigate();
  /** The showcase's guest login. Anywhere else the server answers 404 and the notice says so. */
  const tryIt = async () => {
    if (await run(client.tryAsGuest(), "Signed in as a guest.")) navigate("/learn");
  };
  const submit = async () => setSent(await run(client.signUp(email, password), CHECK_YOUR_EMAIL));
  return (
    <Split title="Sign up">
      <Form submit="Sign up" onSubmit={submit}>
        <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p>12 to 128 characters. A password found in a data breach is refused.</p>
        <Notice outcome={outcome} />
      </Form>
      {sent && (
        <button type="button" className={buttonClass()} onClick={() => void run(client.resendVerification(email), CHECK_YOUR_EMAIL)}>
          Send the link again
        </button>
      )}
      <button type="button" className={buttonClass()} onClick={() => void tryIt()}>
        Try it
      </button>
      <p>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
      <Link to="/try">Try one Review first</Link>
    </Split>
  );
};

/** Where a log in returns to: a path in this app, never another site. */
const returnPath = (next: string | null) => (next?.startsWith("/") && !next.startsWith("//") ? next : "/");

export const Login = () => {
  const client = useClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { outcome, run } = useOutcome();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const submit = async () => {
    if (await run(client.signIn(email, password), "Logged in.")) navigate(returnPath(params.get("next")));
  };
  return (
    <Split title="Log in">
      {params.get("verified") && <p role="status" className="notice">Email verified. You can log in now.</p>}
      {params.get("reset") && <p role="status" className="notice">Password changed. Log in with the new one.</p>}
      <Form submit="Log in" onSubmit={submit}>
        <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Notice outcome={outcome} />
      </Form>
      <div className="account-links">
        <Link to="/forgot-password">Forgot your password?</Link>
        <Link to="/signup">Sign up</Link>
      </div>
    </Split>
  );
};

export const ForgotPassword = () => {
  const client = useClient();
  const { outcome, run } = useOutcome();
  const [email, setEmail] = useState("");
  return (
    <Screen title="Reset your password">
      <Form
        submit="Send the link"
        onSubmit={() => run(client.requestPasswordReset(email), "If that address has an account, we sent a link.")}
      >
        <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Notice outcome={outcome} />
      </Form>
      <Link to="/login">Back to log in</Link>
    </Screen>
  );
};

export const ResetPassword = () => {
  const client = useClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { outcome, run } = useOutcome();
  const [password, setPassword] = useState("");
  const token = params.get("token");
  if (!token) {
    return (
      <Screen title="Choose a new password">
        <p role="alert" className="notice notice--error">This link is not valid. Ask for a new one.</p>
        <Link to="/forgot-password">Reset your password</Link>
      </Screen>
    );
  }
  const submit = async () => {
    if (await run(client.resetPassword(token, password), "Password changed.")) navigate("/login?reset=1");
  };
  return (
    <Screen title="Choose a new password">
      <Form submit="Change password" onSubmit={submit}>
        <Field
          label="New password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Notice outcome={outcome} />
      </Form>
    </Screen>
  );
};
