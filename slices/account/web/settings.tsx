import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { Button, ThemePicker } from "@ibbun/ui";
import type { ActiveSession, CurrentLearner } from "@ibbun/learner/client";
import { useClient } from "./client.ts";
import { Field, Form, Notice, useOutcome } from "./form.tsx";
import { PreferencesSection } from "./preferences.tsx";

/** One of the three columns that sit side by side. */
const Column = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="settings-column" aria-label={title}>
    <h2>{title}</h2>
    {children}
  </section>
);

/** Ends the session, here or everywhere, and goes to log in once that worked. */
const useLeave = () => {
  const navigate = useNavigate();
  return async (action: Promise<{ ok: boolean }>) => {
    if ((await action).ok) navigate("/login");
  };
};

const ChangeEmail = () => {
  const client = useClient();
  const { outcome, run } = useOutcome();
  const [email, setEmail] = useState("");
  return (
    <Form
      submit="Change email"
      onSubmit={() => run(client.changeEmail(email), "We sent a link to the new address. The old one stays in use until you open it.")}
    >
      <Field label="New email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <Notice outcome={outcome} />
    </Form>
  );
};

const ChangePassword = () => {
  const client = useClient();
  const { outcome, run } = useOutcome();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  return (
    <Form submit="Change password" onSubmit={() => run(client.changePassword(current, next), "Password changed. Your other sessions ended.")}>
      <Field label="Current password" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
      <Field label="New password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={next} onChange={(e) => setNext(e.target.value)} />
      <Notice outcome={outcome} />
    </Form>
  );
};

const SessionRow = ({ session, onEnd }: { session: ActiveSession; onEnd: () => void }) => (
  <li className="session-row">
    <span>
      {session.userAgent || "Unknown device"}
      {session.current ? " (this device)" : ""}, last used {session.lastUsedAt.slice(0, 10)}
    </span>
    {!session.current && <Button onClick={onEnd}>End session</Button>}
  </li>
);

/** The pane on the right: every device the Learner is logged in on. The list scrolls by itself. */
const Devices = () => {
  const client = useClient();
  const leave = useLeave();
  const { outcome, run } = useOutcome();
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const load = async () => {
    const r = await client.listSessions();
    if (r.ok) setSessions(r.data);
  };
  useEffect(() => {
    void load();
  }, []);
  const end = async (id: string) => {
    await run(client.endSession(id), "Session ended.");
    await load();
  };
  return (
    <aside className="settings-devices" aria-label="Devices">
      <h2>Devices</h2>
      <ul className="session-list">
        {sessions.map((s) => (
          <SessionRow key={s.id} session={s} onEnd={() => void end(s.id)} />
        ))}
      </ul>
      <Notice outcome={outcome} />
      <Button onClick={() => void leave(client.signOutEverywhere())}>Log out everywhere</Button>
    </aside>
  );
};

const LogOut = () => {
  const client = useClient();
  const leave = useLeave();
  return <Button onClick={() => void leave(client.signOut())}>Log out</Button>;
};

const DeleteAccount = () => {
  const client = useClient();
  const navigate = useNavigate();
  const { outcome, run } = useOutcome();
  const [password, setPassword] = useState("");
  const submit = async () => {
    if (await run(client.deleteAccount(password), "Account deleted.")) navigate("/signup");
  };
  return (
    <div className="account-form">
      <h3>Delete account</h3>
      <p>This deletes your account and everything you studied. It can't be undone.</p>
      <Form submit="Delete my account" onSubmit={submit}>
        <Field label="Password to confirm" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <Notice outcome={outcome} />
      </Form>
    </div>
  );
};

/** Settings across the width: Look, Study and Account side by side, Devices in a pane. Sends a visitor without a session to log in. */
export const Settings = () => {
  const client = useClient();
  const navigate = useNavigate();
  const [learner, setLearner] = useState<CurrentLearner | null>(null);
  useEffect(() => {
    void client.session().then((r) => (r.ok && r.data ? setLearner(r.data) : navigate("/login")));
  }, [client]);
  if (!learner) return null;
  return (
    <section className="settings">
      <h1>Settings</h1>
      <div className="settings-grid">
        <Column title="Look">
          <p>Pick a look and whether it's light or dark. It's saved on this device.</p>
          <ThemePicker />
        </Column>
        <Column title="Study">
          <PreferencesSection />
        </Column>
        <Column title="Account">
          <div className="account-form">
            <h3>Email</h3>
            <p>
              Signed in as <strong>{learner.email}</strong>
            </p>
            <ChangeEmail />
          </div>
          <div className="account-form">
            <h3>Password</h3>
            <ChangePassword />
          </div>
          <LogOut />
          <DeleteAccount />
        </Column>
        <Devices />
      </div>
    </section>
  );
};
