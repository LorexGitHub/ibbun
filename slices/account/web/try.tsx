import { useState } from "react";
import { Link } from "react-router";
import { buttonClass } from "@mojibun/ui";
import { Field, Form, Split } from "./form.tsx";
import { passes, SAMPLE } from "./sample.ts";

/** One Review for a visitor. Nothing is saved; the result leads back to sign-up. */
export const TryReview = () => {
  const [answer, setAnswer] = useState("");
  const [passed, setPassed] = useState<boolean | null>(null);
  const { sentence, word, reading, meaning } = SAMPLE;
  return (
    <Split title="Try one Review">
      <p className="try-sentence" lang="ja">
        {sentence}
      </p>
      {passed === null ? (
        <Form submit="Check" onSubmit={async () => setPassed(passes(SAMPLE, answer))}>
          <Field label={`What does ${word} mean?`} autoComplete="off" required value={answer} onChange={(e) => setAnswer(e.target.value)} />
        </Form>
      ) : (
        <>
          <p role="status" className="notice">
            {passed ? "Correct." : "Not quite."} {word} ({reading}) means {meaning}.
          </p>
          <p>A Review like this comes back just before you would forget it. Sign up and the next one is waiting.</p>
          <div className="account-links">
            <Link className={buttonClass({ variant: "primary" })} to="/signup">
              Sign up to keep going
            </Link>
          </div>
        </>
      )}
    </Split>
  );
};
