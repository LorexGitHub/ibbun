import type { ClipAnswerResponse } from "../contract.ts";

type Done = Exclude<ClipAnswerResponse, { outcome: "retry" }>;

const LABEL = { correct: "correct", wrong: "wrong", missing: "missing" } as const;

/** A failed dictation, token by token: each is correct, wrong or missing, with its surface form and reading. */
export const DictationDiff = ({ diff, extra }: Pick<Done, "diff" | "extra">) => (
  <div>
    <ol aria-label="Dictation diff">
      {diff?.map((token, i) => (
        <li key={i} data-status={token.status}>
          <span lang="ja">{token.surface}</span> <span lang="ja">({token.reading})</span> {LABEL[token.status]}
          {token.typed && (
            <>
              {" "}
              — you wrote <span lang="ja">{token.typed}</span>
            </>
          )}
        </li>
      ))}
    </ol>
    {extra && (
      <p>
        Extra: <span lang="ja">{extra}</span>
      </p>
    )}
  </div>
);
