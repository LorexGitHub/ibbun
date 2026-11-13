import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFakeAuthoring } from "@ibbun/content-graph/testing";
import { world } from "../../server/world.ts";
import { clipSelection, DEFAULT_BANDS, tieBreak, type ClipSelectionConfig } from "./index.ts";

const config: ClipSelectionConfig = {
  bands: { ...DEFAULT_BANDS, N5: { min: 4, max: 6 } },
  voices: [{ voice: "a", speaker: "女" }, { voice: "b", speaker: "男" }],
};

const setup = () => {
  const w = world();
  const auth = createFakeAuthoring(w.graph);
  w.graph.computedLevel.push({ recordId: w.wordId, recordTable: "study_item", level: "N5", unlevelledWordCount: 0 });
  const addExample = (text: string, over: { unlevelled?: number; approval?: "draft" | "approved"; retired?: boolean } = {}) => {
    const sentenceId = randomUUID();
    const exampleId = randomUUID();
    const life = { approval: over.approval ?? "approved", retired: over.retired ?? false, provenanceId: w.life.provenanceId } as const;
    w.graph.sentence.push({ id: sentenceId, text, translationEn: "t", tokens: [], audioKey: null, audioVoice: null, unlevelledWordCount: over.unlevelled ?? 0, ...life });
    w.graph.example.push({ id: exampleId, sentenceId, studyItemId: w.wordId, spanStart: 0, spanEnd: 1, targetSenseId: null, hint: null, comprehensionQuestion: null, ...life });
    return { sentenceId, exampleId };
  };
  const clips = () => w.graph.studyItem.filter((i) => i.type === "listening_clip");
  const liveClipSentences = () =>
    clips().filter((c) => !c.retired).flatMap((c) => w.graph.clipVoicesSentence.filter((l) => l.clipId === c.id).map((l) => l.sentenceId));
  return { w, auth, select: () => clipSelection(auth, config).select(w.wordId), addExample, clips, liveClipSentences };
};

describe("clip selection", () => {
  it("picks the Sentence closest to the length band, skipping any with unlevelled Words", async () => {
    const s = setup();
    s.addExample("あ".repeat(12));
    const inBand = s.addExample("あ".repeat(5));
    s.addExample("あ".repeat(5), { unlevelled: 1 });
    await s.select();
    expect(s.liveClipSentences()).toEqual([inBand.sentenceId]);
  });

  it("measures distance to the nearest edge of the band", async () => {
    const s = setup();
    s.addExample("あ".repeat(10)); // 4 over
    const near = s.addExample("あ".repeat(2)); // 2 under
    await s.select();
    expect(s.liveClipSentences()).toEqual([near.sentenceId]);
  });

  it("breaks ties by hash(Study Item ID, Sentence ID), whatever the order they were added", async () => {
    const s = setup();
    const ids = ["あ", "い", "う", "え"].map((c) => s.addExample(c.repeat(5)).sentenceId);
    await s.select();
    const expected = [...ids].sort((x, y) => tieBreak(s.w.wordId, x).localeCompare(tieBreak(s.w.wordId, y)))[0];
    expect(s.liveClipSentences()).toEqual([expected]);
  });

  it("makes no clip when no Sentence qualifies", async () => {
    const s = setup();
    s.addExample("あ".repeat(5), { unlevelled: 2 });
    s.addExample("あ".repeat(5), { approval: "draft" });
    await s.select();
    expect(s.clips()).toEqual([]);
  });

  it("derives an approved clip with a voice from the allow-list", async () => {
    const s = setup();
    const { sentenceId } = s.addExample("あ".repeat(5));
    await s.select();
    const [clip] = s.clips();
    expect(clip).toMatchObject({ approval: "approved", retired: false });
    expect(s.w.graph.listeningClip).toEqual([{ studyItemId: clip!.id, kind: "sentence" }]);
    const [line] = s.w.graph.clipVoicesSentence;
    expect(line).toMatchObject({ clipId: clip!.id, sentenceId, position: 0, approval: "approved" });
    expect(config.voices).toContainEqual({ voice: line!.voice, speaker: line!.speaker });
  });

  it("is idempotent", async () => {
    const s = setup();
    s.addExample("あ".repeat(5));
    await s.select();
    await s.select();
    expect(s.clips()).toHaveLength(1);
  });

  it("retires the clip and picks again when its Example is retired", async () => {
    const s = setup();
    const best = s.addExample("あ".repeat(5));
    const other = s.addExample("あ".repeat(9));
    await s.select();
    expect(s.liveClipSentences()).toEqual([best.sentenceId]);

    await s.auth.decide({ recordTable: "example", recordId: best.exampleId, outcome: "retired", decider: { kind: "supervisor" } });
    await s.select();
    expect(s.liveClipSentences()).toEqual([other.sentenceId]);
    expect(s.clips().filter((c) => c.retired)).toHaveLength(1);
  });

  it("retires the clip when the last qualifying Example is retired", async () => {
    const s = setup();
    const only = s.addExample("あ".repeat(5));
    await s.select();
    await s.auth.decide({ recordTable: "example", recordId: only.exampleId, outcome: "retired", decider: { kind: "supervisor" } });
    await s.select();
    expect(s.liveClipSentences()).toEqual([]);
  });

  it("makes no clip for an item with no level", async () => {
    const s = setup();
    s.w.graph.computedLevel.length = 0;
    s.addExample("あ".repeat(5));
    await s.select();
    expect(s.clips()).toEqual([]);
  });

  it("makes no clip for a Kanji or an item that is retired", async () => {
    const s = setup();
    s.addExample("あ".repeat(5));
    s.w.graph.computedLevel.push({ recordId: s.w.kanjiId, recordTable: "study_item", level: "N4", unlevelledWordCount: 0 });
    await clipSelection(s.auth, config).select(s.w.kanjiId);
    s.w.graph.studyItem.find((i) => i.id === s.w.wordId)!.retired = true;
    await s.select();
    expect(s.clips()).toEqual([]);
  });

  it("leaves another item's clip alone", async () => {
    const s = setup();
    s.addExample("あ".repeat(5));
    await s.select();
    s.w.graph.computedLevel.push({ recordId: s.w.grammarId, recordTable: "study_item", level: "N5", unlevelledWordCount: 0 });
    await clipSelection(s.auth, config).select(s.w.grammarId);
    expect(s.clips().filter((c) => !c.retired)).toHaveLength(1);
  });
});
