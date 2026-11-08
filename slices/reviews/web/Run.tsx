import { useState } from "react";
import type { DueResponse, ReviewPrompt, SubmitResponse } from "../contract.ts";
import { ReviewCard, type Submit } from "./ReviewCard.tsx";

/** Works through prompts one after another, telling `onResult` how each went and `onFinish` when the last is done. */
export const Run = (props: {
  prompts: ReviewPrompt[];
  preferences: DueResponse["preferences"];
  submit: Submit;
  onResult?: (prompt: ReviewPrompt, result: SubmitResponse) => void;
  onFinish: () => void;
}) => {
  const { prompts, preferences, submit, onResult, onFinish } = props;
  const [at, setAt] = useState(0);
  const prompt = prompts[at];
  if (!prompt) return null;
  const done = (result: SubmitResponse) => {
    onResult?.(prompt, result);
    if (at + 1 < prompts.length) setAt(at + 1);
    else onFinish();
  };
  return (
    <>
      <p>
        {at + 1} of {prompts.length}
      </p>
      <ReviewCard key={prompt.exampleId + at} prompt={prompt} preferences={preferences} submit={submit} onDone={done} />
    </>
  );
};
