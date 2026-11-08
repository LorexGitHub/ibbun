// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudyItemId } from "@mojibun/shared";
import type { Batch, QuizAnswer, QuizPrompt, State } from "../contract.ts";
import { learnApi, type LearnApi } from "./api.ts";
import { notAnswers, shownByDefault, SWITCH_TO_JAPANESE } from "./check.ts";
import { LearnScreen } from "./LearnScreen.tsx";
import { answered, isFinished, startQuiz, type Given } from "./queue.ts";

afterEach(cleanup);

const answer = (id: string, written: string, extra: object = {}) => ({ id, written, reading: null, message: null, ...extra });
const idOf = (n: number) => StudyItemId.parse(`00000000-0000-4000-8000-00000000000${n}`);

const water: QuizPrompt = {
  studyItemId: idOf(1),
  type: "word",
  exampleId: "ex-1",
  mode: "blank",
  sentence: { before: "私は", target: "水", after: "を飲む。" },
  translationEn: "I drink water.",
  japaneseExplanation: "のむことができる、色のないもの。",
  facets: [
    {
      facet: "cloze",
      answerData: {
        facet: "japanese",
        accepted: [answer("a1", "水", { reading: "みず" })],
        alternates: [answer("alt", "お水", { message: "that works, but we want the plain form" })],
        knownWrong: [],
      },
    },
  ],
};

const kanji: QuizPrompt = {
  ...water,
  studyItemId: idOf(2),
  type: "kanji",
  exampleId: "ex-2",
  mode: "highlight",
  facets: [
    { facet: "reading", answerData: { facet: "japanese", accepted: [answer("r1", "水", { reading: "みず" })], alternates: [], knownWrong: [] } },
    { facet: "meaning", answerData: { facet: "meaning", meanings: [{ id: "m0", text: "water" }], knownWrong: [] } },
  ],
};

const lessonOf = (prompt: QuizPrompt, title: string, extra: object = {}) => ({
  studyItemId: prompt.studyItemId,
  type: prompt.type,
  title,
  reading: null,
  meanings: ["water"],
  details: [{ label: "Strokes", value: "4" }],
  japaneseExplanation: null,
  example: { japanese: "私は水を飲む。", translationEn: "I drink water." },
  ...extra,
});

const batchOf = (items: Batch["items"], over: Partial<Batch> = {}): Batch => ({
  preferences: { convertRomaji: true, explanations: "english" },
  remaining: 10,
  items,
  ...over,
});

const state = (over: Partial<State> = {}): State => ({
  activeTracks: [{ level: "N5", type: "word" }],
  batchSize: 5,
  dailyBudget: 15,
  learnedToday: 3,
  ...over,
});

const twoItems = batchOf([
  { lesson: lessonOf(water, "水", { reading: "みず", japaneseExplanation: "のむ水。" }), prompt: water },
  { lesson: lessonOf(kanji, "水"), prompt: kanji },
]);

const apiOf = (over: Partial<LearnApi> = {}): LearnApi => ({
  state: vi.fn(async () => state()),
  batch: vi.fn(async () => twoItems),
  now: vi.fn(async () => twoItems),
  saveTracks: vi.fn(async () => state()),
  skip: vi.fn(async () => undefined),
  complete: vi.fn(async (request) => request.answers.length),
  answerClip: vi.fn(async () => ({ outcome: "pass" as const })),
  ...over,
});

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const open = async (api = apiOf()) => {
  render(<LearnScreen api={api} />);
  await screen.findByRole("heading", { name: "Learn" });
  return api;
};
const lessons = async () => {
  press("Start batch");
  await screen.findByText("Lesson 1 of 2");
};

describe("the quiz queue", () => {
  const given = (...facets: [string, boolean, string?][]): Given[] =>
    facets.map(([facet, passed, input = "x"]) => ({ facet: facet as Given["facet"], input, passed, attempts: [] }));

  it("keeps a correct answer and finishes when nothing is left", () => {
    const quiz = answered(startQuiz([water]), given(["cloze", true, "みず"]), 1200);
    expect(isFinished(quiz)).toBe(true);
    expect(quiz.answers).toEqual([
      { studyItemId: water.studyItemId, exampleId: "ex-1", facets: [{ facet: "cloze", input: "みず", attempts: [] }], timeToAnswerMs: 1200 },
    ]);
  });

  it("sends a miss to the back and keeps the wrong tries for the final answer", () => {
    let quiz = answered(startQuiz([water, kanji]), given(["cloze", false, "ちがう"]), 5);
    expect(quiz.queue.map((p) => p.exampleId)).toEqual(["ex-2", "ex-1"]);
    expect(quiz.answers).toEqual([]);
    quiz = answered(quiz, given(["reading", true, "みず"], ["meaning", true, "water"]), 5);
    quiz = answered(quiz, [{ facet: "cloze", input: "みず", passed: true, attempts: ["お水"] }], 7);
    expect(isFinished(quiz)).toBe(true);
    expect(quiz.answers[1]!.facets).toEqual([{ facet: "cloze", input: "みず", attempts: ["ちがう", "お水"] }]);
  });

  it("keeps the miss of one facet of a Kanji and the passes of the other apart", () => {
    const quiz = answered(startQuiz([kanji]), given(["reading", true, "みず"], ["meaning", false, "wine"]), 5);
    expect(quiz.tries[kanji.studyItemId]).toEqual({ reading: [], meaning: ["wine"] });
  });

  it("ignores an answer when no question is left", () => {
    const quiz = startQuiz([]);
    expect(answered(quiz, [], 1)).toBe(quiz);
  });
});

describe("the Learn screen", () => {
  it("shows the Active Track grid with the Learner's Tracks ticked, and today's budget", async () => {
    await open();
    expect((screen.getByLabelText("N5 Words") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("N5 Kanji") as HTMLInputElement).checked).toBe(false);
    expect(screen.getByLabelText("Unlevelled Grammar")).toBeTruthy();
    expect(screen.getByText(/3 of 15 new items learned today/)).toBeTruthy();
  });

  it("saves the Tracks as they are toggled, and loads the batch again", async () => {
    const api = await open();
    fireEvent.click(screen.getByLabelText("N4 Grammar"));
    await waitFor(() => expect(api.saveTracks).toHaveBeenCalledWith([{ level: "N5", type: "word" }, { level: "N4", type: "grammar_point" }]));
    await waitFor(() => expect(api.batch).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByLabelText("N5 Words"));
    await waitFor(() => expect(api.saveTracks).toHaveBeenLastCalledWith([]));
  });

  it("explains an empty batch: the budget is used, or nothing new is left", async () => {
    const used = apiOf({ batch: vi.fn(async () => batchOf([], { remaining: 0 })) });
    await open(used);
    expect(screen.getByText(/used the budget for new items today/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start batch" })).toBeNull();
    cleanup();
    await open(apiOf({ batch: vi.fn(async () => batchOf([], { remaining: 4 })) }));
    expect(screen.getByText(/Nothing new is left in your active Tracks/)).toBeTruthy();
  });

  it("shows a failure instead of the screen", async () => {
    render(<LearnScreen api={apiOf({ state: vi.fn(async () => Promise.reject(new Error("no session"))) })} />);
    expect((await screen.findByRole("alert")).textContent).toBe("no session");
  });

  it("shows a failure to save the Tracks", async () => {
    await open(apiOf({ saveTracks: vi.fn(async () => Promise.reject(new Error("not saved"))) }));
    fireEvent.click(screen.getByLabelText("N5 Kanji"));
    expect((await screen.findByRole("alert")).textContent).toBe("not saved");
  });
});

describe("a lesson", () => {
  it("teaches one Study Item at a time, then starts the quiz", async () => {
    await open();
    await lessons();
    expect(screen.getByRole("heading", { name: "水" })).toBeTruthy();
    expect(screen.getByText("みず")).toBeTruthy();
    expect(screen.getByText("のむ水。")).toBeTruthy();
    expect(screen.getByText("私は水を飲む。")).toBeTruthy();
    press("Next");
    expect(screen.getByText("Lesson 2 of 2")).toBeTruthy();
    expect(screen.getByText("Strokes")).toBeTruthy();
    press("Start quiz");
    expect(screen.getByRole("heading", { name: "Quiz" })).toBeTruthy();
  });

  it("records I know this, drops the item from the batch and its quiz", async () => {
    const api = await open();
    await lessons();
    press("I know this");
    await waitFor(() => expect(api.skip).toHaveBeenCalledWith(water.studyItemId, false));
    await screen.findByText("Lesson 1 of 1");
    press("Start quiz");
    expect(screen.getByLabelText("Reading in this sentence")).toBeTruthy();
    expect(screen.queryByLabelText("Answer")).toBeNull();
  });

  it("goes back to the Learn screen when every item was skipped", async () => {
    const one = batchOf([twoItems.items[0]!]);
    const api = await open(apiOf({ batch: vi.fn(async () => one) }));
    press("Start batch");
    press("I know this");
    await waitFor(() => expect(api.skip).toHaveBeenCalledOnce());
    expect((await screen.findByText("Skipped.")).textContent).toBe("Skipped.");
  });

  it("shows a failure to record I know this", async () => {
    await open(apiOf({ skip: vi.fn(async () => Promise.reject(new Error("try again"))) }));
    await lessons();
    press("I know this");
    expect((await screen.findByRole("alert")).textContent).toBe("try again");
  });
});

describe("Learn now", () => {
  it("opens the lessons of the asked-for item without the grid, and tells the API the session is Learn now", async () => {
    const api = apiOf({ batch: vi.fn(async () => batchOf([], { remaining: 0 })) });
    render(<LearnScreen api={api} nowId={idOf(2)} />);
    await screen.findByText("Lesson 1 of 2");
    expect(api.now).toHaveBeenCalledWith(idOf(2));
    press("I know this");
    await waitFor(() => expect(api.skip).toHaveBeenCalledWith(twoItems.items[0]!.lesson.studyItemId, true));
  });

  it("sends the quiz as Learn now and returns to the grid", async () => {
    const api = apiOf();
    render(<LearnScreen api={api} nowId={idOf(2)} />);
    await screen.findByText("Lesson 1 of 2");
    press("Next");
    press("Start quiz");
    type("Answer", "みず");
    press("Check");
    await screen.findByText("Correct");
    press("Next");
    type("Reading in this sentence", "みず");
    type("Meaning of the kanji", "water");
    press("Check");
    await screen.findByText("Correct");
    press("Next");
    await waitFor(() => expect(api.complete).toHaveBeenCalledOnce());
    expect(vi.mocked(api.complete).mock.calls[0]![0].now).toBe(true);
    expect(await screen.findByText("2 new items are in your Reviews.")).toBeTruthy();
  });

  it("shows a failure to load the item", async () => {
    render(<LearnScreen api={apiOf({ now: vi.fn(async () => Promise.reject(new Error("no such Study Item"))) })} nowId={idOf(2)} />);
    expect((await screen.findByRole("alert")).textContent).toBe("no such Study Item");
  });

  it("says so when the item has nothing to teach", async () => {
    render(<LearnScreen api={apiOf({ now: vi.fn(async () => batchOf([])) })} nowId={idOf(2)} />);
    expect(await screen.findByText("This item cannot be taught yet.")).toBeTruthy();
  });
});

describe("the quiz", () => {
  const toQuiz = async (api = apiOf()) => {
    await open(api);
    await lessons();
    press("Next");
    press("Start quiz");
    return api;
  };
  const answerWater = (value = "みず") => {
    type("Answer", value);
    press("Check");
  };
  const answerKanji = () => {
    type("Reading in this sentence", "みず");
    type("Meaning of the kanji", "water");
    press("Check");
  };

  it("asks a miss again until it is right, then records the quiz with the tries", async () => {
    const api = await toQuiz();
    answerWater("ちがう");
    expect((await screen.findByRole("status")).textContent).toContain("Not quite");
    expect(screen.getByRole("status").textContent).toContain("水");
    press("Next");
    answerKanji();
    await screen.findByText("Correct");
    press("Next");
    expect(screen.getByText("1 left")).toBeTruthy();
    answerWater();
    await screen.findByText("Correct");
    press("Next");
    await waitFor(() => expect(api.complete).toHaveBeenCalledOnce());
    const { answers } = vi.mocked(api.complete).mock.calls[0]![0] as { answers: QuizAnswer[] };
    expect(answers.map((a) => a.exampleId)).toEqual(["ex-2", "ex-1"]);
    expect(answers[1]).toMatchObject({ studyItemId: water.studyItemId, facets: [{ facet: "cloze", input: "みず", attempts: ["ちがう"] }] });
    expect(typeof answers[1]!.timeToAnswerMs).toBe("number");
    expect((await screen.findByText("2 new items are in your Reviews.")).textContent).toBeTruthy();
  });

  it("asks a Kanji again when only one facet is wrong", async () => {
    await toQuiz();
    answerWater();
    press("Next");
    type("Reading in this sentence", "みず");
    type("Meaning of the kanji", "wine");
    press("Check");
    expect((await screen.findByRole("status")).textContent).toContain("Meaning of the kanji: wrong");
    press("Next");
    expect(screen.getByText("1 left")).toBeTruthy();
  });

  it("does not grade a try that is not an answer or matches an alternate, and keeps it as an attempt", async () => {
    const api = await toQuiz();
    press("Check");
    expect((await screen.findByRole("alert")).textContent).toBe("type an answer first");
    answerWater("お水");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("that works, but we want the plain form"));
    expect(screen.queryByRole("status")).toBeNull();
    expect((screen.getByLabelText("Answer") as HTMLInputElement).value).toBe("");
    answerWater();
    await screen.findByText("Correct");
    press("Next");
    answerKanji();
    await screen.findByText("Correct");
    press("Next");
    await waitFor(() => expect(api.complete).toHaveBeenCalledOnce());
    const { answers } = vi.mocked(api.complete).mock.calls[0]![0] as { answers: QuizAnswer[] };
    expect(answers[0]!.facets[0]!.attempts).toEqual(["", "お水"]);
  });

  it("converts romaji as it is typed, and refuses it when conversion is off", async () => {
    await toQuiz();
    type("Answer", "mizu");
    expect((screen.getByLabelText("Answer") as HTMLInputElement).value).toBe("みず");
    cleanup();
    const off = batchOf(twoItems.items, { preferences: { convertRomaji: false, explanations: "english" } });
    await open(apiOf({ batch: vi.fn(async () => off) }));
    await lessons();
    press("Next");
    press("Start quiz");
    type("Answer", "mizu");
    expect((screen.getByLabelText("Answer") as HTMLInputElement).value).toBe("mizu");
    press("Check");
    expect((await screen.findByRole("alert")).textContent).toBe(SWITCH_TO_JAPANESE);
  });

  it("never converts the English meaning", async () => {
    await toQuiz();
    answerWater();
    press("Next");
    type("Meaning of the kanji", "water");
    expect((screen.getByLabelText("Meaning of the kanji") as HTMLInputElement).value).toBe("water");
  });

  it("shows the Japanese Explanation instead of the translation when only that toggle is on", async () => {
    const japanese = batchOf(twoItems.items, { preferences: { convertRomaji: true, explanations: "japanese" } });
    await open(apiOf({ batch: vi.fn(async () => japanese) }));
    await lessons();
    press("Next");
    press("Start quiz");
    expect(screen.getByText(/のむことができる/)).toBeTruthy();
    expect(screen.queryByText("I drink water.")).toBeNull();
  });

  it("shows a failure to record the quiz", async () => {
    await toQuiz(apiOf({ complete: vi.fn(async () => Promise.reject(new Error("the quiz is not fully correct yet"))) }));
    answerWater();
    press("Next");
    answerKanji();
    press("Next");
    expect((await screen.findByRole("alert")).textContent).toBe("the quiz is not fully correct yet");
  });
});

describe("check helpers", () => {
  it("maps the explanation toggle to what the question shows", () => {
    expect(shownByDefault("english")).toEqual({ translation: true, explanation: false });
    expect(shownByDefault("japanese")).toEqual({ translation: false, explanation: true });
    expect(shownByDefault("both")).toEqual({ translation: true, explanation: true });
  });

  it("explains leftover Latin letters differently when conversion is on", () => {
    const [facet] = water.facets;
    expect(notAnswers([facet!], { cloze: "mizu" }, true)[0]!.note).toBe("finish the kana first");
    expect(notAnswers([facet!], { cloze: "みず" }, true)).toEqual([]);
  });
});

describe("talking to the API", () => {
  const reply = (body: unknown, status = 200) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
  afterEach(() => vi.unstubAllGlobals());
  const lastCall = () => vi.mocked(fetch).mock.calls.at(-1)!;

  it("loads the state and the batch", async () => {
    reply(state());
    expect((await learnApi.state()).dailyBudget).toBe(15);
    expect(lastCall()[0]).toBe("/api/learn/state");
    reply(twoItems);
    expect((await learnApi.batch()).items).toHaveLength(2);
    expect(lastCall()[0]).toBe("/api/learn/batch");
  });

  it("puts the Tracks, posts a skip and posts the quiz as JSON", async () => {
    reply(state());
    await learnApi.saveTracks([{ level: "N5", type: "word" }]);
    expect(lastCall()[0]).toBe("/api/learn/tracks");
    expect(lastCall()[1]).toMatchObject({ method: "PUT", body: JSON.stringify({ tracks: [{ level: "N5", type: "word" }] }) });
    reply({});
    await learnApi.skip(water.studyItemId);
    expect(lastCall()[1]).toMatchObject({ method: "POST", body: JSON.stringify({ studyItemId: water.studyItemId }) });
    reply({ recorded: 2 });
    expect(await learnApi.complete({ answers: [] })).toBe(2);
    expect(lastCall()[0]).toBe("/api/learn/complete");
  });

  it("throws the API's message, or the status text without one", async () => {
    reply({ message: "not a valid quiz" }, 400);
    await expect(learnApi.batch()).rejects.toThrow("not a valid quiz");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401, statusText: "Unauthorized" })));
    await expect(learnApi.batch()).rejects.toThrow("Unauthorized");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "" }), { status: 400, statusText: "Bad Request" })));
    await expect(learnApi.batch()).rejects.toMatchObject({ message: "" });
  });
});
