import { createLearnerClient } from "@ibbun/learner/client";
import { useEffect, useState } from "react";
import type { Who } from "./places.ts";

export const client = createLearnerClient();

/**
 * Who is using the app. Read again on every navigation, because logging in and out happen inside
 * slices. `navigation` is the location's key, not its path: a log in on Home returns to Home.
 */
export const useWho = (navigation: string) => {
  const [who, setWho] = useState<Who>({ state: "loading" });
  useEffect(() => {
    let live = true;
    const settle = (next: Who) => live && setWho(next);
    client.session().then(
      (r) => settle(r.ok && r.data ? { state: "in", learner: r.data } : { state: "out" }),
      () => settle({ state: "out" }),
    );
    return () => {
      live = false;
    };
  }, [navigation]);
  return [who, setWho] as const;
};
