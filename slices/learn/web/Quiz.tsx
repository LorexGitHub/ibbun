import { useState } from "react";
import type { QuizAnswer, QuizPrompt } from "../contract.ts";
import { QuestionCard } from "./QuestionCard.tsx";
import { answered, isFinished, startQuiz } from "./queue.ts";

type Preferences = { convertRomaji: boolean; explanations: "english" | "japanese" | "both" };

/** Asks every question; one answered wrong comes round again until all are right, then hands back the correct answers. */
export const Quiz = ({ prompts, preferences, onPassed }: { prompts: QuizPrompt[]; preferences: Preferences; onPassed: (answers: QuizAnswer[]) => void }) => {
  const [quiz, setQuiz] = useState(() => startQuiz(prompts));
  const [asked, setAsked] = useState(0);
  const prompt = quiz.queue[0];
  if (!prompt) return null;
  return (
    <section>
      <h2>Quiz</h2>
      <p>{quiz.queue.length} left</p>
      <QuestionCard
        key={asked}
        prompt={prompt}
        preferences={preferences}
        onDone={(given, ms) => {
          const next = answered(quiz, given, ms);
          if (isFinished(next)) onPassed(next.answers);
          else setQuiz(next);
          setAsked(asked + 1);
        }}
      />
    </section>
  );
};
