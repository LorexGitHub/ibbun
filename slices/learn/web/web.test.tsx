// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudyItemId } from "@ibbun/shared";
import type { Batch, QuizAnswer, QuizPrompt, State, TextView } from "../contract.ts";
import { learnApi, type LearnApi } from "./learn-client.ts";
import { notAnswers, shownByDefault, SWITCH_TO_JAPANESE } from "./check.ts";
import { faceOf, isOver, sentenceFirst, tallyOf } from "./batch-view.ts";
import { LearnScreen } from "./LearnScreen.tsx";
import { ReadingStep } from "./ReadingStep.tsx";
import { answered, isFinished, startQuiz, type Given } from "./queue.ts";
import { atLevel, levelOf, toggled, tracksOf, typesAt } from "./source.ts";

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
  items,
  ...over,
});

const state = (over: Partial<State> = {}): State => ({ activeTracks: [{ level: "N5", type: "word" }], batchSize: 5, ...over });

const waterItem = { lesson: lessonOf(water, "水", { reading: "みず", japaneseExplanation: "のむ水。" }), prompt: water };
const kanjiItem = { lesson: lessonOf(kanji, "水"), prompt: kanji };
const twoItems = batchOf([waterItem, kanjiItem]);
const fire: QuizPrompt = { ...kanji, studyItemId: idOf(4), exampleId: "ex-4" };
const fireItem = { lesson: lessonOf(fire, "火"), prompt: fire };

const apiOf = (over: Partial<LearnApi> = {}): LearnApi => ({
  state: vi.fn(async () => state()),
  batch: vi.fn(async () => twoItems),
  now: vi.fn(async () => twoItems),
  saveTracks: vi.fn(async () => state()),
  skip: vi.fn(async () => undefined),
  complete: vi.fn(async (request) => request.answers.length),
  answerClip: vi.fn(async () => ({ outcome: "pass" as const })),
  startText: vi.fn(async () => false),
  text: vi.fn(async () => ({ status: "preparing" as const })),
  lookUp: vi.fn(async () => ({ label: "水", reading: "みず", meanings: ["water"] })),
  ...over,
});

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const open = async (api = apiOf()) => {
  render(<LearnScreen api={api} />);
  await screen.findByRole("heading", { name: "Learn" });
  return api;
};
describe("Learn opened for one level", () => {
  afterEach(() => history.replaceState(null, "", "/"));

  it("asks for that level's batch, and for the active Tracks' batch without one", async () => {
    history.replaceState(null, "", "/learn?level=n3");
    expect((await open()).batch).toHaveBeenCalledWith("N3");
    cleanup();
    history.replaceState(null, "", "/learn");
    expect((await open()).batch).toHaveBeenCalledWith(undefined);
  });

  it("shows that level in the chooser, not the active Tracks' level", async () => {
    history.replaceState(null, "", "/learn?level=n3");
    await open();
    expect(checked("radio", "N3")).toBe(true);
    expect(checked("radio", "N5")).toBe(false);
  });
});

const lessons = async () => {
  press("Start");
  await screen.findByText("1 / 2");
};
/** Turns both cards of `twoItems` and starts the quiz. */
const bothLessons = () => {
  press("Not yet");
  press("Next");
  press("Not yet");
  press("Start quiz");
};
const passQuiz = async () => {
  type("Answer", "みず");
  press("Check");
  await screen.findByText("Correct");
  press("Next");
  type("Reading in this sentence", "みず");
  type("Meaning of the kanji", "water");
  press("Check");
  await screen.findByText("Correct");
  press("Next");
};
const learned = (n: number) => screen.findByRole("heading", { name: `${n} learned` });
const checked = (role: "radio" | "checkbox", name: string) => (screen.getByRole(role, { name }) as HTMLInputElement).checked;

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

  it("counts every answer it takes, right or missed", () => {
    expect(startQuiz([water]).asked).toBe(0);
    let quiz = answered(startQuiz([water]), given(["cloze", false]), 5);
    quiz = answered(quiz, given(["cloze", true]), 5);
    expect(quiz.asked).toBe(2);
  });

  it("ignores an answer when no question is left", () => {
    const quiz = startQuiz([]);
    expect(answered(quiz, [], 1)).toBe(quiz);
  });
});

describe("where Learn draws from", () => {
  it("reads the level of the first Active Track, and N5 when there is none", () => {
    expect(levelOf([{ level: "N3", type: "word" }, { level: "N5", type: "kanji" }])).toBe("N3");
    expect(levelOf([])).toBe("N5");
  });

  it("reads the types active at a level", () => {
    const tracks = [{ level: "N3", type: "word" }, { level: "N5", type: "kanji" }, { level: "N3", type: "kanji" }] as const;
    expect(typesAt([...tracks], "N3")).toEqual(["word", "kanji"]);
    expect(typesAt([...tracks], "N1")).toEqual([]);
  });

  it("moves to another level with its types, and takes every type when it has none", () => {
    expect(atLevel({ level: "N5", types: ["word"] }, "N4")).toEqual({ level: "N4", types: ["word"] });
    expect(atLevel({ level: "N5", types: [] }, "unlevelled")).toEqual({ level: "unlevelled", types: ["kanji", "word", "grammar_point"] });
  });

  it("adds a type that is off and drops one that is on", () => {
    expect(toggled({ level: "N5", types: ["word"] }, "kanji").types).toEqual(["word", "kanji"]);
    expect(toggled({ level: "N5", types: ["word", "kanji"] }, "word").types).toEqual(["kanji"]);
  });

  it("is one Track per type", () => {
    expect(tracksOf({ level: "N2", types: ["kanji", "grammar_point"] })).toEqual([{ level: "N2", type: "kanji" }, { level: "N2", type: "grammar_point" }]);
  });
});

describe("a batch as the screens show it", () => {
  const clip = { clip: { studyItemId: idOf(9) } } as Batch["items"][number];

  it("shows a Study Item by its Japanese and its type, and a Listening Clip without its text", () => {
    expect(faceOf(waterItem)).toEqual({ id: idOf(1), title: "水", type: "Word" });
    expect(faceOf(kanjiItem).type).toBe("Kanji");
    expect(faceOf({ ...waterItem, lesson: { ...waterItem.lesson, type: "grammar_point" } }).type).toBe("Grammar Point");
    expect(faceOf(clip)).toEqual({ id: idOf(9), title: "音声", type: "Listening Clip" });
  });

  it("teaches every other Kanji inside its Example, from the first", () => {
    const third = { ...fireItem, lesson: { ...fireItem.lesson, studyItemId: idOf(5) } };
    expect([...sentenceFirst([clip, waterItem, kanjiItem, fireItem, third])]).toEqual([idOf(2), idOf(5)]);
  });

  it("is over when no lesson is left and nothing waits for the quiz", () => {
    expect(isOver([waterItem, kanjiItem], 1, [])).toBe(false);
    expect(isOver([waterItem, kanjiItem], 2, [])).toBe(false);
    expect(isOver([waterItem, kanjiItem], 2, [idOf(1)])).toBe(false);
    expect(isOver([waterItem, kanjiItem], 1, [idOf(1), idOf(2)])).toBe(false);
    expect(isOver([waterItem, kanjiItem], 2, [idOf(1), idOf(2)])).toBe(true);
    expect(isOver([clip], 1, [])).toBe(true);
  });

  it("tallies the batch with a mark on what the Learner marked as Known", () => {
    expect(tallyOf([waterItem, kanjiItem], [idOf(2)], 1)).toEqual({
      learned: 1,
      items: [
        { id: idOf(1), title: "水", type: "Word", known: false },
        { id: idOf(2), title: "水", type: "Kanji", known: true },
      ],
    });
  });
});

describe("the Learn screen", () => {
  it("shows the level and types Learn draws from, and the next Study Items without their meanings", async () => {
    await open();
    expect(checked("radio", "N5")).toBe(true);
    expect(checked("radio", "N4")).toBe(false);
    expect(checked("checkbox", "Words")).toBe(true);
    expect(checked("checkbox", "Kanji")).toBe(false);
    expect(screen.getByRole("radio", { name: "Unlevelled" })).toBeTruthy();
    const cards = within(screen.getByRole("list", { name: "Next up" })).getAllByRole("listitem");
    expect(cards.map((c) => c.textContent)).toEqual(["水Word", "水Kanji"]);
    expect(screen.queryByText("water")).toBeNull();
    expect(screen.queryByText(/today|budget/i)).toBeNull();
  });

  it("changes the level in one choice, keeps the types, and loads the batch again", async () => {
    let saved = state();
    const api = await open(
      apiOf({
        state: vi.fn(async () => saved),
        saveTracks: vi.fn(async (activeTracks) => (saved = state({ activeTracks }))),
      }),
    );
    fireEvent.click(screen.getByRole("radio", { name: "N4" }));
    await waitFor(() => expect(api.saveTracks).toHaveBeenLastCalledWith([{ level: "N4", type: "word" }]));
    await waitFor(() => expect(api.batch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(checked("checkbox", "Words")).toBe(true));
    expect(checked("radio", "N4")).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Grammar" }));
    await waitFor(() => expect(api.saveTracks).toHaveBeenLastCalledWith([{ level: "N4", type: "word" }, { level: "N4", type: "grammar_point" }]));
    await waitFor(() => expect(checked("checkbox", "Grammar")).toBe(true));
    fireEvent.click(screen.getByRole("checkbox", { name: "Words" }));
    await waitFor(() => expect(api.saveTracks).toHaveBeenLastCalledWith([{ level: "N4", type: "grammar_point" }]));
  });

  it("keeps the level when its last type is unticked, and a level alone brings every type", async () => {
    let saved = state();
    const api = await open(apiOf({ state: vi.fn(async () => saved), saveTracks: vi.fn(async (activeTracks) => (saved = state({ activeTracks }))) }));
    fireEvent.click(screen.getByRole("radio", { name: "N3" }));
    await waitFor(() => expect(checked("checkbox", "Words")).toBe(true));
    fireEvent.click(screen.getByRole("checkbox", { name: "Words" }));
    await waitFor(() => expect(api.saveTracks).toHaveBeenLastCalledWith([]));
    await waitFor(() => expect(checked("checkbox", "Words")).toBe(false));
    expect(checked("radio", "N3")).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "N2" }));
    await waitFor(() =>
      expect(api.saveTracks).toHaveBeenLastCalledWith([
        { level: "N2", type: "kanji" },
        { level: "N2", type: "word" },
        { level: "N2", type: "grammar_point" },
      ]),
    );
  });

  it("says nothing new is left for an empty batch, without sending the Learner away", async () => {
    await open(apiOf({ batch: vi.fn(async () => batchOf([])) }));
    expect(screen.getByText("Nothing new is left at this level. Choose another level or type above, or keep what you learned fresh.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Start Reviews" }).getAttribute("href")).toBe("/reviews");
    expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
    expect(screen.queryByRole("list", { name: "Next up" })).toBeNull();
    expect(screen.queryByText(/come back|tomorrow/i)).toBeNull();
  });

  it("shows a failure instead of the screen", async () => {
    render(<LearnScreen api={apiOf({ state: vi.fn(async () => Promise.reject(new Error("no session"))) })} />);
    expect((await screen.findByRole("alert")).textContent).toBe("no session");
  });

  it("shows a failure to save the Tracks", async () => {
    await open(apiOf({ saveTracks: vi.fn(async () => Promise.reject(new Error("not saved"))) }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Kanji" }));
    expect((await screen.findByRole("alert")).textContent).toBe("not saved");
  });
});

describe("a lesson", () => {
  it("shows the Study Item alone, then its facts in place with what the Learner said", async () => {
    await open();
    await lessons();
    expect(screen.getByRole("heading", { name: "水" })).toBeTruthy();
    expect(screen.queryByText("みず")).toBeNull();
    expect(screen.queryByText("water")).toBeNull();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    press("I know this");
    expect(screen.getByRole("heading", { name: "水" })).toBeTruthy();
    expect(screen.getByText("You said: I know this")).toBeTruthy();
    expect(screen.getByText("みず").className).toBe("jp lesson-reading");
    expect(screen.getByText("water")).toBeTruthy();
    expect(screen.getByText("のむ水。").className).toBe("jp lesson-explanation");
    expect(screen.getByText("私は水を飲む。")).toBeTruthy();
    expect(screen.getByText("I drink water.").tagName).toBe("P");
    expect(screen.getByRole("button", { name: "Mark as Known" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Not yet" })).toBeNull();
    press("Next");
    expect(screen.getByText("2 / 2")).toBeTruthy();
  });

  it("shows a Kanji marked inside its Example first, then the reading, the translation and the facts", async () => {
    const { container } = render(<LearnScreen api={apiOf()} />);
    await screen.findByRole("heading", { name: "Learn" });
    await lessons();
    press("Not yet");
    press("Next");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("私は水を飲む。");
    expect(container.querySelector("mark")!.textContent).toBe("水");
    expect(container.querySelector("rt")).toBeNull();
    expect(screen.queryByText("I drink water.")).toBeNull();
    expect(screen.queryByText("Strokes")).toBeNull();
    press("Not yet");
    expect(screen.getByText("You said: not yet")).toBeTruthy();
    expect(container.querySelector("mark rt")!.textContent).toBe("みず");
    expect(screen.getByText("I drink water.").className).toBe("lesson-translation");
    expect(screen.getByText("Strokes")).toBeTruthy();
    expect(screen.getByText("water")).toBeTruthy();
    press("Start quiz");
    expect(screen.getByRole("heading", { name: "Quiz" })).toBeTruthy();
    expect(screen.queryByText(/\d \/ \d/)).toBeNull();
  });

  it("shows the second Kanji of a batch as a card, and a Kanji in a sentence with no reading without one", async () => {
    const bare: QuizPrompt = { ...kanji, facets: [kanji.facets[1]!] };
    const { container } = render(<LearnScreen api={apiOf({ batch: vi.fn(async () => batchOf([{ lesson: lessonOf(bare, "水"), prompt: bare }, fireItem])) })} />);
    await screen.findByRole("heading", { name: "Learn" });
    await lessons();
    press("Not yet");
    expect(container.querySelector("mark")!.textContent).toBe("水");
    expect(container.querySelector("rt")).toBeNull();
    press("Next");
    expect(screen.getByRole("heading", { name: "火" })).toBeTruthy();
    expect(container.querySelector("mark")).toBeNull();
  });

  it("counts up against the batch's fixed size, whatever is marked as Known", async () => {
    const api = await open(apiOf({ batch: vi.fn(async () => batchOf([waterItem, kanjiItem, fireItem])) }));
    press("Start");
    expect(await screen.findByText("1 / 3")).toBeTruthy();
    expect(screen.queryByText(/Lesson/)).toBeNull();
    press("I know this");
    press("Mark as Known");
    await waitFor(() => expect(api.skip).toHaveBeenCalledWith(water.studyItemId, false));
    expect(await screen.findByText("2 / 3")).toBeTruthy();
    press("Not yet");
    press("Next");
    expect(screen.getByText("3 / 3")).toBeTruthy();
  });

  it("leaves an item marked as Known out of the quiz", async () => {
    await open();
    await lessons();
    press("I know this");
    press("Mark as Known");
    await screen.findByText("2 / 2");
    press("Not yet");
    press("Start quiz");
    expect(screen.getByLabelText("Reading in this sentence")).toBeTruthy();
    expect(screen.queryByLabelText("Answer")).toBeNull();
  });

  it("ends on the Tally when every item was marked as Known", async () => {
    const api = await open(apiOf({ batch: vi.fn(async () => batchOf([waterItem])), startText: vi.fn(async () => true) }));
    press("Start");
    press("Not yet");
    press("Mark as Known");
    await waitFor(() => expect(api.skip).toHaveBeenCalledOnce());
    await learned(0);
    expect(within(screen.getByRole("list", { name: "This batch" })).getByRole("listitem").textContent).toBe("水WordKnown");
    expect(screen.queryByRole("button", { name: "Read the story" })).toBeNull();
    expect(api.complete).not.toHaveBeenCalled();
  });

  it("shows a failure to mark an item as Known", async () => {
    await open(apiOf({ skip: vi.fn(async () => Promise.reject(new Error("try again"))) }));
    await lessons();
    press("Not yet");
    press("Mark as Known");
    expect((await screen.findByRole("alert")).textContent).toBe("try again");
    expect(screen.getByText("1 / 2")).toBeTruthy();
  });
});

describe("the Tally", () => {
  const toTally = async (api = apiOf()) => {
    await open(api);
    await lessons();
    bothLessons();
    await passQuiz();
    await learned(2);
    return api;
  };

  it("shows the count, the batch with a mark per item, and the way home", async () => {
    await toTally();
    const rows = within(screen.getByRole("list", { name: "This batch" })).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual(["水WordLearned", "水KanjiLearned"]);
    expect(screen.getByRole("link", { name: "Done for now" }).getAttribute("href")).toBe("/");
    expect(screen.queryByRole("button", { name: "Read the story" })).toBeNull();
  });

  it("keeps going with the next batch, as often as the Learner likes", async () => {
    const api = await toTally();
    await waitFor(() => expect(api.batch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect((screen.getByRole("button", { name: "Keep going" }) as HTMLButtonElement).disabled).toBe(false));
    press("Keep going");
    expect(await screen.findByText("1 / 2")).toBeTruthy();
    expect(api.startText).toHaveBeenCalledTimes(2);
    bothLessons();
    await passQuiz();
    await learned(2);
    await waitFor(() => expect(api.batch).toHaveBeenCalledTimes(3));
  });

  it("holds Keep going until the next batch is loaded", async () => {
    let release = (_: Batch) => undefined as void;
    const batch = vi.fn<LearnApi["batch"]>().mockResolvedValueOnce(twoItems).mockReturnValueOnce(new Promise((r) => (release = r)));
    await toTally(apiOf({ batch }));
    expect((screen.getByRole("button", { name: "Keep going" }) as HTMLButtonElement).disabled).toBe(true);
    release(batchOf([fireItem]));
    await waitFor(() => expect((screen.getByRole("button", { name: "Keep going" }) as HTMLButtonElement).disabled).toBe(false));
    press("Keep going");
    expect(await screen.findByText("1 / 1")).toBeTruthy();
  });

  it("goes to the Learn screen when nothing new is left to keep going with", async () => {
    const batch = vi.fn<LearnApi["batch"]>().mockResolvedValueOnce(twoItems).mockResolvedValue(batchOf([]));
    await toTally(apiOf({ batch }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Keep going" }) as HTMLButtonElement).disabled).toBe(false));
    press("Keep going");
    expect(await screen.findByText(/Nothing new is left/)).toBeTruthy();
  });
});

describe("Learn now", () => {
  it("opens the lessons of the asked-for item without the Learn screen, and tells the API the session is Learn now", async () => {
    const api = apiOf({ batch: vi.fn(async () => batchOf([])) });
    render(<LearnScreen api={api} nowId={idOf(2)} />);
    await screen.findByText("1 / 2");
    expect(api.now).toHaveBeenCalledWith(idOf(2));
    expect(screen.queryByRole("radio", { name: "N5" })).toBeNull();
    press("I know this");
    press("Mark as Known");
    await waitFor(() => expect(api.skip).toHaveBeenCalledWith(water.studyItemId, true));
  });

  it("sends the quiz as Learn now and ends on the Tally", async () => {
    const api = apiOf();
    render(<LearnScreen api={api} nowId={idOf(2)} />);
    await screen.findByText("1 / 2");
    bothLessons();
    await passQuiz();
    await waitFor(() => expect(api.complete).toHaveBeenCalledOnce());
    expect(vi.mocked(api.complete).mock.calls[0]![0].now).toBe(true);
    expect(await learned(2)).toBeTruthy();
    expect(api.startText).not.toHaveBeenCalled();
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
    bothLessons();
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
    expect(answers[1]!.timeToAnswerMs).toBeGreaterThanOrEqual(0);
    expect(answers[1]!.timeToAnswerMs).toBeLessThan(60_000);
    expect(await learned(2)).toBeTruthy();
  });

  it("shows the reading, not the Kanji, after a wrong reading", async () => {
    await toQuiz();
    answerWater();
    press("Next");
    type("Reading in this sentence", "ちがう");
    type("Meaning of the kanji", "water");
    press("Check");
    const miss = (await screen.findByRole("status")).querySelector(".answer--miss")!;
    expect(miss.textContent).toContain("It is みず");
    expect(miss.textContent).not.toContain("水");
  });

  it("names every answer field in sight, and marks each facet of a checked answer right or missed", async () => {
    await toQuiz();
    const named = () => [...document.querySelectorAll(".field > .caps")].map((label) => label.textContent);
    expect(named()).toEqual(["Answer"]);
    answerWater();
    press("Next");
    expect(named()).toEqual(["Reading in this sentence", "Meaning of the kanji"]);
    type("Reading in this sentence", "みず");
    type("Meaning of the kanji", "wine");
    press("Check");
    const status = await screen.findByRole("status");
    const lines = [...status.querySelectorAll(".answer")];
    expect(lines.map((line) => line.className)).toEqual(["answer answer--right", "answer answer--miss"]);
    expect(status.querySelector('p[lang="en"]')!.textContent).toBe("I drink water.");
    expect(status.querySelector('p[lang="ja"]')!.textContent).toBe("のむことができる、色のないもの。");
  });

  it("blanks the word of a cloze until it is checked, and marks a Kanji in its sentence", async () => {
    const { container } = render(<LearnScreen api={apiOf()} />);
    await screen.findByRole("heading", { name: "Learn" });
    await lessons();
    bothLessons();
    const sentence = () => container.querySelector(".sentence")!;
    expect(sentence().querySelector('[aria-label="blank"]')).toBeTruthy();
    expect(sentence().querySelector("strong")).toBeNull();
    answerWater();
    expect(sentence().querySelector("strong")!.textContent).toBe("水");
    press("Next");
    expect(sentence().querySelector("mark")!.textContent).toBe("水");
    expect(sentence().querySelector('[aria-label="blank"]')).toBeNull();
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
    bothLessons();
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
    bothLessons();
    expect(screen.getByText(/のむことができる/).tagName).toBe("P");
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
    expect((await learnApi.state()).batchSize).toBe(5);
    expect(lastCall()[0]).toBe("/api/learn/state");
    reply(twoItems);
    expect((await learnApi.batch()).items).toHaveLength(2);
    expect(lastCall()[0]).toBe("/api/learn/batch");
    await learnApi.batch("N3");
    expect(lastCall()[0]).toBe("/api/learn/batch?level=N3");
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

const story: TextView = {
  title: "朝ごはん",
  sentences: [
    {
      id: "00000000-0000-4000-8000-0000000000a1",
      runs: [
        { text: "水", reading: "みず", wordId: idOf(1), highlight: "batch" },
        { text: "茶", reading: null, wordId: idOf(3), highlight: "earlier" },
        { text: "。", reading: null, wordId: null, highlight: null },
      ],
      translation: "Water and tea.",
    },
  ],
};

describe("the reading screen", () => {
  const ready = () => apiOf({ text: vi.fn(async () => ({ status: "ready" as const, text: story })) });

  it("asks for the Batch Text when the batch starts, and offers the story on the Tally without forcing it", async () => {
    const api = apiOf({ ...ready(), startText: vi.fn(async () => true) });
    await open(api);
    await lessons();
    expect(api.startText).toHaveBeenCalledWith([idOf(1), idOf(2)]);
    bothLessons();
    await passQuiz();
    await learned(2);
    expect(api.text).not.toHaveBeenCalled();
    press("Read the story");
    await screen.findByText("朝ごはん");
    expect(api.text).toHaveBeenCalledWith([idOf(1), idOf(2)]);
    press("Done");
    await learned(2);
    expect(screen.queryByRole("button", { name: "Read the story" })).toBeNull();
  });

  it("offers the story after a batch of one", async () => {
    await open(apiOf({ ...ready(), batch: vi.fn(async () => batchOf([waterItem])), complete: vi.fn(async () => 1), startText: vi.fn(async () => true) }));
    press("Start");
    press("Not yet");
    press("Start quiz");
    type("Answer", "みず");
    press("Check");
    await screen.findByText("Correct");
    press("Next");
    await learned(1);
    expect(screen.getByRole("button", { name: "Read the story" })).toBeTruthy();
  });

  it("offers no story when the batch got no Batch Text, or when asking for one failed", async () => {
    const api = apiOf({ ...ready(), startText: vi.fn(async () => Promise.reject(new Error("no queue"))) });
    await open(api);
    await lessons();
    bothLessons();
    await passQuiz();
    await learned(2);
    expect(screen.queryByRole("button", { name: "Read the story" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("styles batch Words and earlier Words differently and hides the translation until tapped", async () => {
    render(<ReadingStep api={ready()} ids={[idOf(1)]} onDone={() => undefined} />);
    const batch = await screen.findByRole("button", { name: /水/ });
    expect(batch.getAttribute("data-highlight")).toBe("batch");
    expect(screen.getByRole("button", { name: /茶/ }).getAttribute("data-highlight")).toBe("earlier");
    expect(screen.queryByText("Water and tea.")).toBeNull();
    press("Show translation");
    expect(screen.getByText("Water and tea.")).toBeTruthy();
  });

  it("looks a Word up when tapped", async () => {
    const api = ready();
    render(<ReadingStep api={api} ids={[idOf(1)]} onDone={() => undefined} />);
    fireEvent.click(await screen.findByRole("button", { name: /水/ }));
    expect((await screen.findByRole("status", { name: "Lookup" })).textContent).toContain("water");
    expect(api.lookUp).toHaveBeenCalledWith(idOf(1));
  });

  it("keeps asking until the text is approved", async () => {
    const text = vi.fn<LearnApi["text"]>().mockResolvedValueOnce({ status: "preparing" }).mockResolvedValue({ status: "ready", text: story });
    render(<ReadingStep api={apiOf({ text })} ids={[idOf(1)]} onDone={() => undefined} pollMs={1} />);
    expect(screen.getByText("Preparing your story…")).toBeTruthy();
    await screen.findByText("朝ごはん");
    expect(text).toHaveBeenCalledTimes(2);
  });

  it("points to Reading when the text is not ready in time, and can be skipped", async () => {
    const onDone = vi.fn();
    render(<ReadingStep api={apiOf()} ids={[idOf(1)]} onDone={onDone} waitMs={5} pollMs={1} />);
    expect((await screen.findByText(/still being prepared/)).textContent).toContain("Reading");
    expect(screen.getByRole("link", { name: "Reading" }).getAttribute("href")).toBe("/reading");
    press("Skip reading");
    expect(onDone).toHaveBeenCalledOnce();
  });
});

describe("Learn by keyboard", () => {
  const key = (k: string, on: Element = document.body) => fireEvent.keyDown(on, { key: k });
  const markOn = (name: string) => screen.getByRole("button", { name }).querySelector("kbd")?.textContent;

  it("starts on Enter, answers a card with 1 or 2, and moves on with Enter", async () => {
    await open();
    expect(markOn("Start")).toBe("↵");
    key("Enter");
    await screen.findByText("1 / 2");
    expect([markOn("Not yet"), markOn("I know this")]).toEqual(["1", "2"]);

    key("1");
    expect(screen.getByText("You said: not yet")).toBeTruthy();
    expect(markOn("Next")).toBe("↵");
    expect(markOn("Mark as Known")).toBeUndefined();
    key("Enter");
    expect(screen.getByText("2 / 2")).toBeTruthy();

    key("2");
    expect(screen.getByText("You said: I know this")).toBeTruthy();
    key("Enter");
    expect(screen.getByRole("heading", { name: "Quiz" })).toBeTruthy();
  });

  it("puts the cursor in the first field of each question, checks on Enter and moves on with Enter", async () => {
    const api = await open();
    await lessons();
    bothLessons();

    const answer = screen.getByLabelText("Answer");
    expect(document.activeElement).toBe(answer);
    expect(markOn("Check")).toBe("↵");
    type("Answer", "みず");
    key("Enter", answer);
    await screen.findByText("Correct");
    expect(markOn("Next")).toBe("↵");
    key("Enter");

    expect(document.activeElement).toBe(screen.getByLabelText("Reading in this sentence"));
    type("Reading in this sentence", "みず");
    type("Meaning of the kanji", "water");
    key("Enter", screen.getByLabelText("Meaning of the kanji"));
    await screen.findByText("Correct");
    key("Enter");
    await waitFor(() => expect(api.complete).toHaveBeenCalledOnce());

    await learned(2);
    await waitFor(() => expect((screen.getByRole("button", { name: "Keep going" }) as HTMLButtonElement).disabled).toBe(false));
    expect(markOn("Keep going")).toBe("↵");
    key("Enter");
    expect(await screen.findByText("1 / 2")).toBeTruthy();
  });

  it("types a digit into the answer instead of taking it as a key", async () => {
    await open();
    await lessons();
    bothLessons();
    expect(key("1", screen.getByLabelText("Answer"))).toBe(true);
    expect(screen.getByRole("heading", { name: "Quiz" })).toBeTruthy();
  });
});
