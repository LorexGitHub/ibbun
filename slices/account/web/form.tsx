import { useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { Button, Card, Input } from "@ibbun/ui";
import type { Result } from "@ibbun/learner/client";
import "./account.css";

/** What the Learner is told after an action: a success or the server's own message. */
export type Outcome = { ok: boolean; text: string };

/** Runs an action and keeps its outcome. Resolves true when it worked. */
export const useOutcome = () => {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const run = async (action: Promise<Result<unknown>>, success: string): Promise<boolean> => {
    const result = await action;
    setOutcome(result.ok ? { ok: true, text: success } : { ok: false, text: result.message });
    return result.ok;
  };
  return { outcome, run, clear: () => setOutcome(null) };
};

export const Notice = ({ outcome }: { outcome: Outcome | null }) =>
  outcome && (
    <p role={outcome.ok ? "status" : "alert"} className={outcome.ok ? "notice" : "notice notice--error"}>
      {outcome.text}
    </p>
  );

export const Field = ({ label, ...input }: { label: string } & InputHTMLAttributes<HTMLInputElement>) => (
  <label className="field">
    <span>{label}</span>
    <Input {...input} />
  </label>
);

/** A form that calls `onSubmit` and does not reload the page. */
export const Form = ({
  submit,
  onSubmit,
  children,
}: {
  submit: string;
  onSubmit: () => Promise<unknown>;
  children: ReactNode;
}) => {
  const send = (event: FormEvent) => {
    event.preventDefault();
    void onSubmit();
  };
  return (
    <form className="account-form" onSubmit={send}>
      {children}
      <Button type="submit" variant="primary">
        {submit}
      </Button>
    </form>
  );
};

/** What a visitor meets: the line set upright in Japanese on the accent, and the form beside it. */
export const Split = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="account-split">
    <div className="account-panel">
      <p className="account-line" lang="ja">
        一文ずつ。
      </p>
      <p>One sentence at a time.</p>
    </div>
    <div className="account-side">
      <h1>{title}</h1>
      {children}
    </div>
  </section>
);

/** One screen: a heading over a card of forms. */
export const Screen = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="account-screen">
    <h1>{title}</h1>
    <Card className="account-card">{children}</Card>
  </section>
);
