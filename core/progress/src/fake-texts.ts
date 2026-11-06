import { randomUUID } from "node:crypto";
import { createTextsOver, type Text, type Texts } from "./texts.ts";

/** An in-memory Texts that passes the same contract as the real one. */
export const createFakeTexts = (): Texts => {
  const all: Text[] = [];
  return createTextsOver(
    {
      async append(text) {
        all.push(structuredClone(text));
      },
      async read(learnerId, kind) {
        const mine = all.filter((t) => t.learnerId === learnerId && t.kind === kind);
        return structuredClone(mine.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)));
      },
    },
    randomUUID,
  );
};
