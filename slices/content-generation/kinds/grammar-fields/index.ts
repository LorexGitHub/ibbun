import { randomUUID } from "node:crypto";
import { z } from "zod";
import { checkMatcherRule, type Authoring, type GenerationRun } from "@mojibun/content-graph/authoring";
import { currentLevel } from "@mojibun/content-graph/levels";
import type { Token } from "@mojibun/content-graph";
import { definePlan, type Kind } from "../kind.ts";

export const TEMPLATE_VERSION = "grammar-fields/1";

const Step = z
  .object({ lemma: z.string().min(1), partOfSpeech: z.array(z.string().min(1)).min(1), conjugationForm: z.string().min(1) })
  .partial()
  .strict()
  .refine((step) => Object.keys(step).length > 0, { error: "a step must require a lemma, a part of speech or a conjugation form" });
const Gap = z.object({ gap: z.number().int().min(1).max(5) }).strict();

const MatcherRule = z
  .object({ pattern: z.array(z.union([Step, Gap])).min(1) })
  .refine(({ pattern }) => !(pattern[0] && "gap" in pattern[0]), { error: "a pattern must start with a token, not a gap" });

/** What the answer must be. A rule that misses one of the point's tokenised example Sentences is refused here, so the model hears it. */
const fieldsFor = (examples: readonly { text: string; tokens: readonly Token[] }[]) =>
  z
    .object({
      title: z.string().min(1),
      forms: z.array(z.object({ text: z.string().min(1), register: z.enum(["casual", "polite"]) })).min(1),
      formation: z.array(z.string().min(1)).min(1),
      register: z.enum(["casual", "neutral", "polite", "formal"]),
      meaning: z.string().min(1),
      matcherRule: MatcherRule,
    })
    .superRefine((fields, ctx) => {
      for (const failure of checkMatcherRule(fields.matcherRule as never, examples))
        ctx.addIssue({ code: "custom", path: ["matcherRule"], message: failure.message });
    });

const SYSTEM = `You complete the record of one Japanese grammar point for JLPT learners. Give the pattern as its title, every surface form tagged casual or polite, the formation as structured slots (such as "V-て", "しまう"), the register, a short English meaning like a dictionary gloss, and a Matcher Rule.
A Matcher Rule is a pattern over Sudachi tokens: a list of steps, each requiring a lemma, a part of speech (a prefix of the token's part-of-speech list) or a conjugation form, with optional { "gap": n } steps that skip up to n tokens. It must start with a token and must match every example sentence given. Answer only in the requested JSON shape.`;

const tokenLine = (t: Token) => `${t.surface}/${t.lemma}/${t.partOfSpeech.join("-")}/${t.conjugationForm ?? "-"}`;

/** The point's own Examples that already carry Sudachi tokens. */
const tokenisedExamples = async (auth: Authoring, studyItemId: string) => {
  const examples = (await auth.rows("example", { studyItemId, retired: false })).filter((e) => e.approval !== "rejected");
  const sentences = await Promise.all(examples.map((e) => auth.rows("sentence", { id: e.sentenceId })));
  return sentences.flat().filter((s) => s.tokens.length > 0);
};

const write = async (auth: Authoring, studyItemId: string, recordIds: string[], fields: z.output<ReturnType<typeof fieldsFor>>, run: GenerationRun) => {
  await auth.insert("provenance", [
    {
      id: randomUUID(),
      source: { kind: "generated", model: run.model, promptTemplateVersion: run.promptTemplateVersion, generationRunId: run.id },
      licence: "mojibun",
      author: null,
      sourceUrl: null,
      inputs: recordIds,
    },
  ]);
  await auth.update("grammarPoint", { studyItemId }, fields);
};

/** The missing or rejected fields of a Grammar Point, and its Matcher Rule (grammar-points.md#fields). The point stays a draft. */
export const grammarFields: Kind = {
  name: "grammar-fields",
  async plan(auth, request, feedback) {
    const [item] = await auth.rows("studyItem", { id: request.targetId, type: "grammar_point", retired: false });
    const [point] = item ? await auth.rows("grammarPoint", { studyItemId: item.id }) : [];
    if (!item || !point) return null;
    const examples = await tokenisedExamples(auth, item.id);
    const level = currentLevel(await auth.rows("levelCandidate", { studyItemId: item.id })) ?? "N1";
    const facts = [
      `Title: ${point.title}`,
      `Forms: ${point.forms.map((f) => `${f.text} (${f.register})`).join("、") || "none"}`,
      `Formation: ${point.formation.join("; ") || "none"}`,
      `Register: ${point.register}`,
      `Meaning: ${point.meaning || "none"}`,
      ...(point.notes ? [`Notes: ${point.notes}`] : []),
    ];
    const sentences = examples.map((s) => `${s.text}\n  ${s.tokens.map(tokenLine).join(" ")}`);
    return definePlan({
      templateVersion: TEMPLATE_VERSION,
      system: SYSTEM,
      prompt: [
        `Complete every field of this JLPT ${level} Grammar Point, correcting any that are wrong. Keep the Matcher Rule matching all of its example sentences.`,
        ...facts,
        ...(sentences.length ? ["Example sentences (surface/lemma/part of speech/conjugation form):", ...sentences] : []),
        ...(feedback ? [`The previous attempt was rejected: ${feedback}`] : []),
      ].join("\n"),
      output: fieldsFor(examples),
      inputs: [...facts, ...examples.map((s) => s.text)],
      write: (output, run) => write(auth, item.id, [item.id, ...examples.map((s) => s.id)], output, run),
    });
  },
};
