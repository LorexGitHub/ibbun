import { checkMatcherRule, type Authoring, type Failure, type Level, type MatcherRule, type Row } from "@mojibun/content-graph/authoring";
import { currentLevel } from "@mojibun/content-graph/levels";
import type { Rec } from "../../src/drafts.ts";

/** A drafted Grammar Point: its fields and Matcher Rule, reviewed as one unit with the draft links the rule proposed (grammar-points.md#fields). */
export type GrammarFieldsDraft = {
  kind: "grammar-fields";
  primary: Rec;
  /** The proposed links come first; the Study Item is last so Suspension checks see the others decided. */
  records: Rec[];
  point: Row<"grammarPoint">;
  links: { sentence: Row<"sentence">; link: Row<"sentenceDemonstratesGrammar"> }[];
};

export type GrammarFieldsCheck = { failures: Failure[]; level: Level };

/** The Grammar Point a Generation Run wrote fields for, unless it is gone or already decided. Rejected fields are redrafted into the same point. */
const undecidedPoint = async (a: Authoring, runId: string) => {
  const [run] = await a.rows("generationRun", { id: runId });
  const [request] = await a.rows("generationRequest", { id: run!.requestId });
  const [item] = await a.rows("studyItem", { id: request!.targetId, type: "grammar_point", retired: false });
  const [point] = item ? await a.rows("grammarPoint", { studyItemId: item.id }) : [];
  return item && item.approval !== "approved" ? { item, point: point! } : undefined;
};

const proposedLinks = async (a: Authoring, grammarPointId: string): Promise<GrammarFieldsDraft["links"]> => {
  const proposed = await a.rows("sentenceDemonstratesGrammar", { grammarPointId, approval: "draft" });
  return Promise.all(proposed.map(async (link) => ({ link, sentence: (await a.rows("sentence", { id: link.sentenceId }))[0]! })));
};

export const grammarFieldsDrafts = async (a: Authoring, runId: string): Promise<GrammarFieldsDraft[]> => {
  const found = await undecidedPoint(a, runId);
  if (!found) return [];
  const links = await proposedLinks(a, found.item.id);
  const primary: Rec = { table: "studyItem", id: found.item.id };
  const records: Rec[] = [...links.map(({ link }) => ({ table: "sentenceDemonstratesGrammar" as const, id: link.id })), primary];
  return [{ kind: "grammar-fields", primary, records, point: found.point, links }];
};

const missingFields = (point: Row<"grammarPoint">): Failure[] =>
  [
    [!point.title.trim(), "The title is missing."],
    [point.forms.length === 0, "There is no surface form."],
    [point.formation.length === 0, "The formation is missing."],
    [!point.meaning.trim(), "The English meaning is missing."],
    [point.matcherRule == null, "There is no Matcher Rule."],
  ].flatMap(([missing, message]) => (missing ? [{ check: "required-field", message: message as string }] : []));

/** Required fields are filled, and the Matcher Rule matches every one of the point's own tokenised example Sentences. */
export const checkGrammarFields = async (a: Authoring, { point }: GrammarFieldsDraft): Promise<GrammarFieldsCheck> => {
  const examples = (await a.rows("example", { studyItemId: point.studyItemId, retired: false })).filter((e) => e.approval !== "rejected");
  const sentences = (await Promise.all(examples.map((e) => a.rows("sentence", { id: e.sentenceId })))).flat();
  const own = sentences.filter((s) => s.tokens.length > 0);
  const failures = [...missingFields(point), ...(point.matcherRule == null ? [] : checkMatcherRule(point.matcherRule as MatcherRule, own))];
  return { failures, level: currentLevel(await a.rows("levelCandidate", { studyItemId: point.studyItemId })) };
};

const orNone = (text: string | null | undefined): string => text || "none";

const linkLine = ({ sentence, link }: GrammarFieldsDraft["links"][number]): string =>
  `- ${sentence.text} (${orNone(sentence.translationEn)}) 「${sentence.text.slice(link.spanStart, link.spanEnd)}」`;

/** The values the rubric template needs. */
export const grammarFieldsValues = ({ point, links }: GrammarFieldsDraft, check: GrammarFieldsCheck): Record<string, string> => ({
  target: point.title,
  level: check.level ?? "Unlevelled",
  title: point.title,
  forms: orNone(point.forms.map((f) => `${f.text} (${f.register})`).join("、")),
  formation: orNone(point.formation.join(" + ")),
  register: point.register,
  meaning: point.meaning,
  notes: orNone(point.notes),
  matcherRule: JSON.stringify(point.matcherRule),
  links: orNone(links.map(linkLine).join("\n")),
});
