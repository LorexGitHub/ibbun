import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { Button, ThemePicker } from "@mojibun/ui";
import type { ActiveSession, CurrentLearner } from "@mojibun/learner/client";
import { useClient } from "./client.ts";
import { Field, Form, Notice, Screen, useOutcome } from "./form.tsx";
import { PreferencesSection } from "./preferences.tsx";

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="account-form" aria-label={title}>
    <h2>{title}</h2>
    {children}
  </section>
);

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

const Sessions = () => {
  const client = useClient();
  const navigate = useNavigate();
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
  const leave = async (action: Promise<{ ok: boolean }>) => {
    if ((await action).ok) navigate("/login");
  };
  return (
    <Section title="Sessions">
      <ul className="session-list">
        {sessions.map((s) => (
          <SessionRow key={s.id} session={s} onEnd={() => void end(s.id)} />
        ))}
      </ul>
      <Notice outcome={outcome} />
      <div className="account-links">
        <Button onClick={() => void leave(client.signOut())}>Log out</Button>
        <Button onClick={() => void leave(client.signOutEverywhere())}>Log out everywhere</Button>
      </div>
    </Section>
  );
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
    <Section title="Delete account">
      <p>This deletes your account and everything you studied. It can't be undone.</p>
      <Form submit="Delete my account" onSubmit={submit}>
        <Field label="Password to confirm" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <Notice outcome={outcome} />
      </Form>
    </Section>
  );
};

/** Settings: appearance, email, password, sessions, preferences and account deletion. Sends a visitor without a session to log in. */
export const Settings = () => {
  const client = useClient();
  const navigate = useNavigate();
  const [learner, setLearner] = useState<CurrentLearner | null>(null);
  useEffect(() => {
    void client.session().then((r) => (r.ok && r.data ? setLearner(r.data) : navigate("/login")));
  }, [client]);
  if (!learner) return null;
  return (
    <Screen title="Settings">
      <Section title="Appearance">
        <p>Pick a look and whether it's light or dark. It's saved on this device.</p>
        <ThemePicker />
      </Section>
      <Section title="Email">
        <p>
          Signed in as <strong>{learner.email}</strong>
        </p>
        <ChangeEmail />
      </Section>
      <ChangePassword />
      <Sessions />
      <PreferencesSection />
      <DeleteAccount />
    </Screen>
  );
};
