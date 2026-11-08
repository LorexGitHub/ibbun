import { useState } from "react";
import { Button } from "@mojibun/ui";
import type { Facet, SubmitResponse } from "../contract.ts";
import { FLAGGABLE_FACETS, type FlagRequest } from "./contract.ts";

export type Flag = (request: FlagRequest) => Promise<void>;

/** The facet of a wrong, typed answer the Learner may say was right, or null when there is none. */
export const flaggableFacet = (result: SubmitResponse, revealed: boolean): Facet | null =>
  revealed ? null : (result.facets.find((f) => f.outcome === "fail" && (FLAGGABLE_FACETS as readonly string[]).includes(f.facet))?.facet ?? null);

/** Sends the flag to the reviews API. */
export const flagAnswer: Flag = async (request) => {
  const response = await fetch("/api/reviews/flag", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error(response.statusText);
};

type State = "idle" | "sending" | "sent" | "failed";

/** "My answer was right": sends the graded facet to Content Approval. It never changes the grade just given. */
export const FlagButton = ({ request, flag }: { request: FlagRequest; flag: Flag }) => {
  const [state, setState] = useState<State>("idle");
  const send = () => {
    setState("sending");
    flag(request).then(
      () => setState("sent"),
      () => setState("failed"),
    );
  };
  if (state === "sent") return <p role="status">Thanks, we will check your answer. This Review stays as graded.</p>;
  return (
    <>
      <Button disabled={state === "sending"} onClick={send}>
        My answer was right
      </Button>
      {state === "failed" && <p role="alert">Could not send the flag. Try again.</p>}
    </>
  );
};
