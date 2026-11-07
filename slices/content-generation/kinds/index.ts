import { answerData } from "./answer-data/index.ts";
import { exampleSentence } from "./example-sentence/index.ts";
import type { Kind } from "./kind.ts";
import { mergeProposal, senseAlignment } from "./proposals/index.ts";
import { readingPassage } from "./reading-passage/index.ts";

/** Every generated kind. A kind added later is one line here and a folder next to this file. */
export const KINDS: readonly Kind[] = [exampleSentence, answerData, readingPassage, mergeProposal, senseAlignment];
