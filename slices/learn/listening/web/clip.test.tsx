// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudyItemId } from "@mojibun/shared";
import type { Batch, QuizPrompt } from "../../contract.ts";
import { LearnScreen } from "../../web/LearnScreen.tsx";
import type { LearnApi } from "../../web/learn-client.ts";
import type { ClipLesson, ClipVerdict } from "../contract.ts";

const plays: { src: string; rate: number }[] = [];
let held: (() => void)[] | null = null;

class FakeAudio {
  playbackRate = 1;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly src: string) {}
  async play() {
    plays.push({ src: this.src, rate: this.playbackRate });
    if (held) held.push(() => this.onended?.());
    else queueMicrotask(() => this.onended?.());
  }
}

beforeEach(() => {
  plays.length = 0;
  held = null;
  vi.stubGlobal("Audio", FakeAudio);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const id = StudyItemId.parse("00000000-0000-4000-8000-000000000010");
const wordId = StudyItemId.parse("00000000-0000-4000-8000-000000000011");

const dictation: ClipLesson = {
  studyItemId: id,
  exampleId: "e1",
  lines: [
    { speaker: "女", text: "パンを食べる。", translationEn: "I eat bread.", src: "/audio/a.ogg" },
    { speaker: "男", text: "いいですね。", translationEn: null, src: "/audio/b.ogg" },
  ],
  links: [{ studyItemId: wordId, label: "パン" }],
  question: { kind: "dictation" },
  examMode: false,
  slowAudio: false,
};
const comprehension: ClipLesson = {
  ...dictation,
  question: { kind: "comprehension", prompt: "女の人は何をしますか。", choices: ["買い物", "勉強"] },
};

const batchOf = (clip: ClipLesson): Batch => ({ preferences: { convertRomaji: true, explanations: "english" }, items: [{ clip }] });

const apiOf = (clip: ClipLesson, verdicts: ClipVerdict[] = [{ outcome: "pass" }]): LearnApi => {
  const queue = [...verdicts];
  return {
    state: vi.fn(async () => ({ activeTracks: [], batchSize: 5 })),
    batch: vi.fn(async () => batchOf(clip)),
    now: vi.fn(async () => batchOf(clip)),
    saveTracks: vi.fn(),
    skip: vi.fn(async () => undefined),
    complete: vi.fn(),
    startText: vi.fn(async () => false),
    text: vi.fn(async () => ({ status: "preparing" as const })),
    lookUp: vi.fn(),
    answerClip: vi.fn(async () => queue.shift() ?? { outcome: "pass" as const }),
  };
};

const press = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const start = async (api: LearnApi) => {
  render(<LearnScreen api={api} />);
  fireEvent.click(await screen.findByRole("button", { name: "Start" }));
  await screen.findByText("1 / 1");
};
const play = async (n: number) => {
  press(/^(Play|Replay)$/);
  await waitFor(() => expect(plays).toHaveLength(n));
};
const toQuiz = async () => {
  press("Read it");
  press("Start quiz");
  await screen.findByRole("heading", { name: /Quiz/ });
};

describe("a Listening Clip lesson", () => {
  it("listens first, with replay and slow speed, then reads the transcript, translation and links", async () => {
    await start(apiOf(dictation));
    expect(screen.queryByText("パンを食べる。")).toBeNull();
    await play(2);
    expect(plays.map((p) => p.src)).toEqual(["/audio/a.ogg", "/audio/b.ogg"]);
    fireEvent.click(screen.getByLabelText(/Slow/));
    press("Replay");
    await waitFor(() => expect(plays).toHaveLength(4));
    expect(plays.at(-1)!.rate).toBe(0.75);

    press("Read it");
    expect(screen.getByText("パンを食べる。")).toBeTruthy();
    expect(screen.getByText("I eat bread.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "パン" }).getAttribute("href")).toBe(`/browse/items/${wordId}`);
  });

  it("ignores Exam Mode in Listen: replay and slow speed stay", async () => {
    await start(apiOf({ ...dictation, examMode: true, slowAudio: true }));
    await play(2);
    expect(screen.getByRole("button", { name: "Replay" })).toBeTruthy();
    expect(screen.getByLabelText(/Slow/)).toBeTruthy();
  });

  it("quizzes a dictation on a fresh play and finishes the batch on a pass", async () => {
    const api = apiOf(dictation);
    await start(api);
    await toQuiz();
    expect(screen.queryByLabelText("What did you hear?")).toBeNull();
    await play(2);
    fireEvent.change(screen.getByLabelText("What did you hear?"), { target: { value: "パンをたべる" } });
    press("Check");
    await screen.findByRole("heading", { name: "1 learned" });
    expect(api.answerClip).toHaveBeenCalledWith(
      expect.objectContaining({ studyItemId: id, exampleId: "e1", input: "パンをたべる", attempts: [], replays: 0, slow: false }),
    );
  });

  it("shows the answer after a miss and asks again on a fresh play, keeping the miss as an attempt", async () => {
    const api = apiOf(comprehension, [{ outcome: "fail", correctChoice: "買い物" }, { outcome: "pass" }]);
    await start(api);
    await toQuiz();
    await play(2);
    press("勉強");
    await screen.findByText("Not quite");
    expect(screen.getByText("買い物")).toBeTruthy();
    press("Try again");
    await play(4);
    press("買い物");
    await screen.findByRole("heading", { name: "1 learned" });
    expect(api.answerClip).toHaveBeenLastCalledWith(expect.objectContaining({ input: "買い物", attempts: ["勉強"] }));
  });

  it("keeps asking when the try is not an answer", async () => {
    const api = apiOf(dictation, [{ outcome: "retry" }, { outcome: "pass" }]);
    await start(api);
    await toQuiz();
    await play(2);
    press("Check");
    await screen.findByRole("status");
    fireEvent.change(screen.getByLabelText("What did you hear?"), { target: { value: "パン" } });
    press("Check");
    await screen.findByRole("heading", { name: "1 learned" });
    expect(api.answerClip).toHaveBeenLastCalledWith(expect.objectContaining({ attempts: [""] }));
  });

  it("honours Exam Mode in the quiz: question first, one play, no replay, no slow", async () => {
    await start(apiOf({ ...comprehension, examMode: true, slowAudio: true }));
    await toQuiz();
    expect(screen.getByText("女の人は何をしますか。")).toBeTruthy();
    expect(screen.queryByLabelText(/Slow/)).toBeNull();
    await play(2);
    expect(screen.getByText("Played once")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Play" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("reports a failed answer instead of hanging", async () => {
    const api = { ...apiOf(dictation), answerClip: vi.fn(async () => Promise.reject(new Error("nope"))) };
    await start(api);
    await toQuiz();
    await play(2);
    fireEvent.change(screen.getByLabelText("What did you hear?"), { target: { value: "x" } });
    press("Check");
    await screen.findByRole("alert");
  });

  it("starts Listen at normal speed, or slow when the Learner's setting says so", async () => {
    await start(apiOf(dictation));
    await play(2);
    expect(plays.map((p) => p.rate)).toEqual([1, 1]);
    cleanup();
    plays.length = 0;
    await start(apiOf({ ...dictation, slowAudio: true }));
    expect((screen.getByLabelText(/Slow/) as HTMLInputElement).checked).toBe(true);
    await play(2);
    expect(plays.map((p) => p.rate)).toEqual([0.75, 0.75]);
  });

  it("plays Exam Mode's one play at normal speed, even with slow speed on", async () => {
    await start(apiOf({ ...dictation, examMode: true, slowAudio: true }));
    await toQuiz();
    await play(2);
    expect(plays.map((p) => p.rate)).toEqual([1, 1]);
  });

  it("holds the play button while the clip is playing", async () => {
    held = [];
    await start(apiOf(dictation));
    press("Play");
    expect((screen.getByRole("button", { name: "Replay" }) as HTMLButtonElement).disabled).toBe(true);
    held.shift()!();
    await waitFor(() => expect(held).toHaveLength(1));
    held.shift()!();
    await waitFor(() => expect((screen.getByRole("button", { name: "Replay" }) as HTMLButtonElement).disabled).toBe(false));
  });

  it("shows a speaker and a translation only for the lines that have them, and no links when there are none", async () => {
    const lines = [
      { speaker: null, text: "ただの文。", translationEn: null, src: "/audio/a.ogg" },
      { speaker: "女" as const, text: "はい。", translationEn: "Yes.", src: "/audio/b.ogg" },
    ];
    const { container } = render(<LearnScreen api={apiOf({ ...dictation, lines, links: [] })} />);
    fireEvent.click(await screen.findByRole("button", { name: "Start" }));
    await screen.findByText("1 / 1");
    press("Read it");
    expect([...container.querySelectorAll("b")].map((b) => b.textContent)).toEqual(["女 "]);
    expect(container.querySelectorAll("details")).toHaveLength(1);
    expect(screen.getByText("Yes.").closest("details")).not.toBeNull();
    expect(screen.queryByText(/Words and grammar/)).toBeNull();
  });

  it("times the answer from the start of the quiz and counts only plays after the first as replays", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000);
    const api = apiOf(dictation);
    await start(api);
    await toQuiz();
    await play(2);
    press("Replay");
    await waitFor(() => expect(plays).toHaveLength(4));
    fireEvent.change(screen.getByLabelText("What did you hear?"), { target: { value: "パン" } });
    now.mockReturnValue(4500);
    press("Check");
    await screen.findByRole("heading", { name: "1 learned" });
    expect(api.answerClip).toHaveBeenCalledWith(expect.objectContaining({ replays: 1, timeToAnswerMs: 3500 }));
  });

  it("shows no alert until something fails, and no right option after a dictation miss", async () => {
    await start(apiOf(dictation, [{ outcome: "fail" }]));
    await toQuiz();
    await play(2);
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.change(screen.getByLabelText("What did you hear?"), { target: { value: "ちがう" } });
    press("Check");
    await screen.findByText("Not quite");
    expect(screen.queryByText(/Answer:/)).toBeNull();
  });
});

describe("a batch with more than one lesson", () => {
  const prompt: QuizPrompt = {
    studyItemId: StudyItemId.parse("00000000-0000-4000-8000-000000000001"),
    type: "word",
    exampleId: "ex-1",
    mode: "blank",
    sentence: { before: "私は", target: "水", after: "を飲む。" },
    translationEn: null,
    japaneseExplanation: null,
    facets: [
      {
        facet: "cloze",
        answerData: { facet: "japanese", accepted: [{ id: "a1", written: "水", reading: "みず", message: null }], alternates: [], knownWrong: [] },
      },
    ],
  };
  const lesson = {
    studyItemId: prompt.studyItemId,
    type: "word" as const,
    title: "水",
    reading: "みず",
    meanings: ["water"],
    details: [],
    japaneseExplanation: null,
    example: { japanese: "私は水を飲む。", translationEn: null },
  };
  const second = { ...dictation, studyItemId: StudyItemId.parse("00000000-0000-4000-8000-000000000012") };

  const openWith = async (items: Batch["items"]) => {
    const api = { ...apiOf(dictation), batch: vi.fn(async () => ({ ...batchOf(dictation), items })), complete: vi.fn(async () => 1) };
    render(<LearnScreen api={api} />);
    fireEvent.click(await screen.findByRole("button", { name: "Start" }));
    return api;
  };
  const passClip = async () => {
    press("Read it");
    press("Start quiz");
    await screen.findByRole("heading", { name: /Quiz/ });
    await play(plays.length + 2);
    fireEvent.change(screen.getByLabelText("What did you hear?"), { target: { value: "パン" } });
    press("Check");
  };

  it("goes on to the next clip, and finishes after the last one with the number learned", async () => {
    await openWith([{ clip: dictation }, { clip: second }]);
    await screen.findByText("1 / 2");
    await passClip();
    await screen.findByText("2 / 2");
    await passClip();
    await screen.findByRole("heading", { name: "2 learned" });
  });

  it("asks the batch quiz for the other items after the clip, and counts both", async () => {
    const api = await openWith([{ clip: dictation }, { lesson, prompt }]);
    await screen.findByText("1 / 2");
    await passClip();
    await screen.findByText("2 / 2");
    press("Not yet");
    press("Start quiz");
    fireEvent.change(screen.getByLabelText("Answer"), { target: { value: "みず" } });
    press("Check");
    await screen.findByText("Correct");
    press("Next");
    await screen.findByRole("heading", { name: "2 learned" });
    expect(api.complete).toHaveBeenCalledOnce();
  });

  it("finishes at once when the only item left after Mark as Known is a clip already passed", async () => {
    const api = await openWith([{ clip: dictation }, { lesson, prompt }]);
    await screen.findByText("1 / 2");
    await passClip();
    await screen.findByText("2 / 2");
    press("I know this");
    press("Mark as Known");
    await screen.findByRole("heading", { name: "1 learned" });
    expect(api.skip).toHaveBeenCalledWith(prompt.studyItemId, false);
  });
});
