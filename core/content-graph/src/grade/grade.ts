/**
 * The one grader (docs/review-answer-model.md#the-grader). Pure and dependency-free,
 * so the web client and the API run the same code.
 */

export type Outcome = "pass" | "fail" | "retry";

export type GradeResult = { outcome: Outcome; matchedAnswerId?: string; message?: string };

/** An Example's answer row: a written form, its kana reading, and a nudge or explanation. */
export type Answer = { id: string; written: string; reading?: string | null; message?: string | null };

export type JapaneseAnswerData = {
  facet: "japanese";
  accepted: Answer[];
  alternates: Answer[];
  knownWrong: Answer[];
};

export type MeaningAnswerData = {
  facet: "meaning";
  meanings: { id: string; text: string }[];
  knownWrong: { id: string; answer: string; explanation: string }[];
};

export type DictationAnswerData = { facet: "dictation"; tokens: { surface: string; reading: string }[] };

export type ComprehensionAnswerData = { facet: "comprehension"; answer: number; choiceCount: number };

export type AnswerData = JapaneseAnswerData | MeaningAnswerData | DictationAnswerData | ComprehensionAnswerData;

export type InputFor<D extends AnswerData> = D extends ComprehensionAnswerData ? number : string;

const PASS: GradeResult = { outcome: "pass" };
const FAIL: GradeResult = { outcome: "fail" };
const RETRY: GradeResult = { outcome: "retry" };

export function grade<D extends AnswerData>(answerData: D, input: InputFor<D>): GradeResult {
  const data = answerData as AnswerData;
  switch (data.facet) {
    case "japanese":
      return gradeJapanese(data, input as string);
    case "meaning":
      return gradeMeaning(data, input as string);
    case "dictation":
      return gradeDictation(data, input as string);
    case "comprehension":
      return gradeComprehension(data, input as number);
  }
}

/** NFKC, trimmed, and the final 。！？ removed. */
export function normalise(text: string): string {
  return text.normalize("NFKC").trim().replace(/[。!?]$/u, "").trim();
}

function isNotAJapaneseAnswer(input: string): boolean {
  return input === "" || /[a-z]/iu.test(input);
}

const KATAKANA = /[ァ-ヶ]/u;

function toHiragana(text: string): string {
  return text.replace(/[ァ-ヶ]/gu, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/** Hiragana and katakana count as the same only when the accepted form is in katakana. */
function matchesForm(input: string, form: string): boolean {
  return input === form || (KATAKANA.test(form) && toHiragana(input) === toHiragana(form));
}

function formsOf(answer: Answer): string[] {
  return [answer.written, answer.reading].flatMap((form) => (form ? [normalise(form)] : []));
}

function findAnswer(answers: Answer[], input: string): Answer | undefined {
  return answers.find((answer) => formsOf(answer).some((form) => matchesForm(input, form)));
}

function result(outcome: Outcome, answer: { id: string; message?: string | null }): GradeResult {
  return answer.message ? { outcome, matchedAnswerId: answer.id, message: answer.message } : { outcome, matchedAnswerId: answer.id };
}

function gradeJapanese(data: JapaneseAnswerData, raw: string): GradeResult {
  const input = normalise(raw);
  if (isNotAJapaneseAnswer(input)) return RETRY;
  const lists: [Answer[], Outcome][] = [
    [data.accepted, "pass"],
    [data.alternates, "retry"],
    [data.knownWrong, "fail"],
  ];
  for (const [answers, outcome] of lists) {
    const match = findAnswer(answers, input);
    if (match) return result(outcome, match);
  }
  return FAIL;
}

/** Lower-cased, punctuation removed, a leading "to " or article dropped. */
export function normaliseMeaning(text: string): string {
  return normalise(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/^(to|a|an|the) /u, "");
}

/** 1 minus the Levenshtein distance over the longer length. */
export function similarity(a: string, b: string): number {
  const longer = Math.max(a.length, b.length);
  return longer === 0 ? 1 : 1 - levenshtein(a, b) / longer;
}

function levenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (const [i, char] of [...a].entries()) {
    const current = [i + 1];
    for (let j = 1; j <= b.length; j++) {
      const substitution = previous[j - 1]! + (char === b[j - 1] ? 0 : 1);
      current.push(Math.min(previous[j]! + 1, current[j - 1]! + 1, substitution));
    }
    previous = current;
  }
  return previous[b.length]!;
}

const MEANING_THRESHOLD = 0.8;

function gradeMeaning(data: MeaningAnswerData, raw: string): GradeResult {
  const input = normaliseMeaning(raw);
  if (input === "") return RETRY;
  const wrong = data.knownWrong.find((known) => normaliseMeaning(known.answer) === input);
  if (wrong) return result("fail", { id: wrong.id, message: wrong.explanation });
  const scored = data.meanings.map((meaning) => ({ meaning, score: similarity(input, normaliseMeaning(meaning.text)) }));
  const best = scored.reduce<(typeof scored)[number] | undefined>((top, next) => (top && top.score >= next.score ? top : next), undefined);
  return best && best.score >= MEANING_THRESHOLD ? result("pass", best.meaning) : FAIL;
}

/** Dictation also ignores all punctuation and spaces. */
function stripForDictation(text: string): string {
  return normalise(text).replace(/[\p{P}\p{S}\s]/gu, "");
}

function gradeDictation(data: DictationAnswerData, raw: string): GradeResult {
  const input = stripForDictation(raw);
  if (isNotAJapaneseAnswer(input)) return RETRY;
  const tokens = data.tokens
    .map((token) => [token.surface, token.reading].map(stripForDictation).filter((form) => form !== ""))
    .filter((forms) => forms.length > 0);
  return spells(input, tokens) ? PASS : FAIL;
}

/** Whether the input is the tokens in order, each typed as its surface or its reading. */
function spells(input: string, tokens: string[][]): boolean {
  const reachable = new Set([0]);
  for (const forms of tokens) {
    const next = new Set<number>();
    for (const at of reachable) {
      for (const form of forms) {
        if (matchesForm(input.slice(at, at + form.length), form)) next.add(at + form.length);
      }
    }
    reachable.clear();
    next.forEach((at) => reachable.add(at));
  }
  return reachable.has(input.length);
}

function gradeComprehension(data: ComprehensionAnswerData, choice: number): GradeResult {
  if (!Number.isInteger(choice) || choice < 0 || choice >= data.choiceCount) return RETRY;
  return choice === data.answer ? PASS : FAIL;
}
