// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudyItemId } from "@ibbun/shared";
import type { DueResponse, ReviewPrompt, SubmitRequest, SubmitResponse } from "../contract.ts";
import { ReviewCard } from "./ReviewCard.tsx";
import { loadDue, ReviewsScreen, submitAnswer } from "./ReviewsScreen.tsx";
import { notAnswers, shownByDefault } from "./check.ts";

afterEach(cleanup);

const answer = (id: string, written: string, extra: object = {}) => ({ id, written, reading: null, message: null, ...extra });

const cloze: ReviewPrompt = {
  studyItemId: StudyItemId.parse("00000000-0000-4000-8000-000000000001"),
  type: "word",
  exampleId: "ex-1",
  mode: "blank",
  sentence: { before: "私は", target: "水", after: "を飲む。" },
  translationEn: "I drink water.",
  japaneseExplanation: "のむことができる、色のないもの。",
  hint: "a liquid",
  facets: [
    {
      facet: "cloze",
      answerData: {
        facet: "japanese",
        accepted: [answer("a1", "水", { reading: "みず" })],
        alternates: [answer("alt", "お水", { message: "that works, but we want the plain form" })],
        knownWrong: [answer("kw", "火", { message: "That is fire." })],
      },
    },
  ],
};

const kanji: ReviewPrompt = {
  ...cloze,
  type: "kanji",
  mode: "highlight",
  facets: [
    { facet: "reading", answerData: { facet: "japanese", accepted: [answer("r1", "水", { reading: "みず" })], alternates: [], knownWrong: [] } },
    { facet: "meaning", answerData: { facet: "meaning", meanings: [{ id: "m0", text: "water" }], knownWrong: [] } },
  ],
};

const noClips = async () => ({ clips: [] });
const PASS: SubmitResponse = { passed: true, facets: [{ facet: "cloze", outcome: "pass" }] };
const prefs = (over: Partial<DueResponse["preferences"]> = {}): DueResponse["preferences"] => ({ convertRomaji: true, explanations: "english", ...over });

const mount = (prompt = cloze, preferences = prefs(), result: SubmitResponse = PASS) => {
  const submit = vi.fn(async (_: SubmitRequest) => result);
  const onDone = vi.fn();
  render(<ReviewCard prompt={prompt} preferences={preferences} submit={submit} onDone={onDone} />);
  return { submit, onDone };
};
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const press = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const lastRequest = (submit: ReturnType<typeof mount>["submit"]) => submit.mock.calls.at(-1)![0];

describe("a cloze Review", () => {
  it("blanks the target and shows the translation but not the Japanese Explanation by default", () => {
    mount();
    expect(screen.getByLabelText("blank")).toBeTruthy();
    expect(screen.queryByText("水")).toBeNull();
    expect(screen.getByText("I drink water.")).toBeTruthy();
    expect(screen.queryByText(/のむことができる/)).toBeNull();
  });

  it("submits the typed answer with the time to answer, then offers Next", async () => {
    const { submit, onDone } = mount();
    type("Answer", "みず");
    press("Check");
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(lastRequest(submit)).toMatchObject({ exampleId: "ex-1", revealed: false, hintsOpened: [], facets: [{ facet: "cloze", input: "みず", attempts: [] }] });
    expect(typeof lastRequest(submit).timeToAnswerMs).toBe("number");
    expect((await screen.findByRole("status")).textContent).toContain("Correct");
    press("Next");
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("converts romaji to kana as it is typed when the preference is on", async () => {
    mount();
    type("Answer", "mizu");
    expect((screen.getByLabelText("Answer") as HTMLInputElement).value).toBe("みず");
  });

  it("leaves typed Latin letters alone when the preference is off, and refuses them", async () => {
    const { submit } = mount(cloze, prefs({ convertRomaji: false }));
    type("Answer", "mizu");
    expect((screen.getByLabelText("Answer") as HTMLInputElement).value).toBe("mizu");
    press("Check");
    expect((await screen.findByRole("alert")).textContent).toBe("switch to Japanese input");
    expect(submit).not.toHaveBeenCalled();
  });

  it("keeps a try that is not an answer or matches an alternate as an attempt, never graded, and clears the field", async () => {
    const { submit } = mount();
    press("Check");
    expect((await screen.findByRole("alert")).textContent).toBe("type an answer first");
    type("Answer", "お水");
    press("Check");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("that works, but we want the plain form"));
    expect(submit).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Answer") as HTMLInputElement).value).toBe("");
    type("Answer", "みず");
    press("Check");
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(lastRequest(submit).facets[0]!.attempts).toEqual(["", "お水"]);
  });

  it("has no Undo once answered: the input is locked and only Next is left", async () => {
    mount();
    type("Answer", "みず");
    press("Check");
    await screen.findByRole("status");
    expect((screen.getByLabelText("Answer") as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: /check|undo|show answer/i })).toBeNull();
  });

  it("records which hints were opened, and the hint text appears only when opened", async () => {
    const { submit } = mount();
    expect(screen.queryByText("a liquid")).toBeNull();
    press("Hint");
    press("Explanation");
    expect(screen.getByText("a liquid")).toBeTruthy();
    expect(screen.getByText(/のむことができる/)).toBeTruthy();
    type("Answer", "みず");
    press("Check");
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(lastRequest(submit).hintsOpened).toEqual(["hint", "explanation"]);
  });

  it("Show answer submits as revealed and shows the accepted answer", async () => {
    const { submit } = mount(cloze, prefs(), { passed: false, facets: [{ facet: "cloze", outcome: "fail" }] });
    press("Show answer");
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(lastRequest(submit)).toMatchObject({ revealed: true });
    await screen.findByRole("status");
    expect(screen.getByText("水").className).toBe("answer answer--miss");
    expect(screen.getByRole("status").textContent).not.toContain("水");
  });

  it("turns the gap into the answer in place once answered right", async () => {
    mount();
    type("Answer", "みず");
    press("Check");
    await screen.findByRole("status");
    expect(screen.getByText("水").className).toBe("answer answer--right");
    expect(screen.queryByLabelText("blank")).toBeNull();
  });

  it("gives the meaning under the sentence once answered, whatever the toggles say", async () => {
    mount(cloze, prefs({ explanations: "japanese" }));
    expect(screen.queryByText("I drink water.")).toBeNull();
    type("Answer", "みず");
    press("Check");
    await screen.findByRole("status");
    expect(screen.getAllByText("I drink water.")).toHaveLength(1);
    expect(screen.getAllByText(/のむことができる/)).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Explanation" })).toBeNull();
  });

  it("offers the Explanation after the answer, and it goes once opened", async () => {
    mount();
    type("Answer", "みず");
    press("Check");
    await screen.findByRole("status");
    expect(screen.queryByText(/のむことができる/)).toBeNull();
    press("Explanation");
    expect(screen.getAllByText(/のむことができる/)).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Explanation" })).toBeNull();
  });

  it("offers no Explanation when the Example has none", async () => {
    mount({ ...cloze, japaneseExplanation: null });
    type("Answer", "みず");
    press("Check");
    await screen.findByRole("status");
    expect(screen.queryByRole("button", { name: "Explanation" })).toBeNull();
  });

  it("shows the Japanese Explanation by default when only that toggle is on, and offers the translation", () => {
    mount(cloze, prefs({ explanations: "japanese" }));
    expect(screen.getByText(/のむことができる/)).toBeTruthy();
    expect(screen.queryByText("I drink water.")).toBeNull();
    expect(screen.getByRole("button", { name: "Translation" })).toBeTruthy();
  });
});

describe("a Kanji Review", () => {
  it("highlights the Word and asks both facets", async () => {
    const { submit } = mount(kanji, prefs(), { passed: true, facets: [{ facet: "reading", outcome: "pass" }, { facet: "meaning", outcome: "pass" }] });
    expect(screen.getByText("水").tagName).toBe("MARK");
    type("Reading in this sentence", "みず");
    type("Meaning of the kanji", "water");
    press("Check");
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(lastRequest(submit).facets.map((f) => [f.facet, f.input])).toEqual([["reading", "みず"], ["meaning", "water"]]);
  });

  it("lists the accepted answers after a miss, since nothing was blanked", async () => {
    mount(kanji, prefs(), { passed: false, facets: [{ facet: "reading", outcome: "fail" }, { facet: "meaning", outcome: "pass" }] });
    press("Show answer");
    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("water");
    expect(status.textContent).toContain("水");
  });

  it("lists no answers when both facets were right", async () => {
    mount(kanji, prefs(), { passed: true, facets: [{ facet: "reading", outcome: "pass" }, { facet: "meaning", outcome: "pass" }] });
    type("Reading in this sentence", "みず");
    type("Meaning of the kanji", "water");
    press("Check");
    expect((await screen.findByRole("status")).textContent).not.toContain("water");
  });

  it("never converts the English meaning", () => {
    mount(kanji);
    type("Meaning of the kanji", "water");
    expect((screen.getByLabelText("Meaning of the kanji") as HTMLInputElement).value).toBe("water");
  });

  it("does not submit while the meaning is empty", () => {
    const { submit } = mount(kanji);
    type("Reading in this sentence", "みず");
    press("Check");
    expect(submit).not.toHaveBeenCalled();
  });
});

describe("check helpers", () => {
  it("maps the explanation toggle to what the prompt shows", () => {
    expect(shownByDefault("english")).toEqual({ translation: true, explanation: false });
    expect(shownByDefault("japanese")).toEqual({ translation: false, explanation: true });
    expect(shownByDefault("both")).toEqual({ translation: true, explanation: true });
  });

  it("explains leftover Latin letters differently when conversion is on", () => {
    const [facet] = cloze.facets;
    expect(notAnswers([facet!], { cloze: "mizu" }, true)[0]!.note).toBe("finish the kana first");
    expect(notAnswers([facet!], { cloze: "みず" }, true)).toEqual([]);
  });
});

describe("Reviews opened for one level", () => {
  afterEach(() => history.replaceState(null, "", "/"));
  const due = (reviews: ReviewPrompt[]): DueResponse => ({ preferences: prefs(), reviews });

  it("asks for that level's Reviews and clips, and starts again from the top when the level changes", async () => {
    history.replaceState(null, "", "/reviews?level=n3");
    const load = vi.fn(async () => due([]));
    const clips = vi.fn(noClips);
    render(<ReviewsScreen load={load} clips={clips} ghosts={async () => due([])} />);
    expect(await screen.findByText(/No Reviews are due/)).toBeTruthy();
    expect(load).toHaveBeenCalledWith("N3");
    expect(clips).toHaveBeenCalledWith("N3");

    load.mockImplementation(async () => due([cloze]));
    act(() => {
      history.replaceState(null, "", "/reviews");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(await screen.findByRole("textbox")).toBeTruthy();
    expect(load).toHaveBeenLastCalledWith(undefined);
    expect(screen.queryByText(/No Reviews are due/)).toBeNull();
  });
});

describe("talking to the API", () => {
  const reply = (body: unknown, status = 200) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
  afterEach(() => vi.unstubAllGlobals());

  it("loads the due Reviews from /api/reviews/due", async () => {
    reply({ preferences: prefs(), reviews: [cloze] });
    expect((await loadDue()).reviews).toHaveLength(1);
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe("/api/reviews/due");
    await loadDue("N3");
    expect(vi.mocked(fetch).mock.calls[1]![0]).toBe("/api/reviews/due?level=N3");
  });

  it("posts an answer as JSON and reads the result", async () => {
    reply(PASS);
    const request: SubmitRequest = { studyItemId: cloze.studyItemId, exampleId: "ex-1", facets: [{ facet: "cloze", input: "みず" }] };
    expect(await submitAnswer(request)).toEqual(PASS);
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe("/api/reviews/answer");
    expect(init).toMatchObject({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) });
  });

  it("fails with the API's message, or the status text when it sends none", async () => {
    reply({ message: "log in first" }, 401);
    await expect(loadDue()).rejects.toThrow("log in first");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500, statusText: "Server Error" })));
    await expect(loadDue()).rejects.toThrow("Server Error");
  });
});

describe("the reviews screen", () => {
  const due = (reviews: ReviewPrompt[]): DueResponse => ({ preferences: prefs(), reviews });

  it("says so when nothing is due", async () => {
    render(<ReviewsScreen load={async () => due([])} ghosts={async () => due([])} clips={noClips} />);
    expect(await screen.findByRole("heading", { name: "No Reviews are due." })).toBeTruthy();
  });

  it("still asks the due Listening Clips when no Reviews are due", async () => {
    const clip = {
      clipId: StudyItemId.parse("00000000-0000-4000-8000-000000000009"),
      exampleId: "clip-ex",
      audio: [{ src: "/audio/a.ogg", speaker: null }],
      question: { kind: "dictation" as const },
      examMode: false,
      slowAudio: false,
    };
    render(<ReviewsScreen load={async () => due([])} ghosts={async () => due([])} clips={async () => ({ clips: [clip] })} />);
    expect(await screen.findByRole("heading", { name: "Listening" })).toBeTruthy();
    expect(screen.queryByText(/No Reviews are due/)).toBeNull();
  });

  it("asks the due Listening Clips after the Reviews, before the session completes", async () => {
    const clip = {
      clipId: StudyItemId.parse("00000000-0000-4000-8000-000000000009"),
      exampleId: "clip-ex",
      audio: [{ src: "/audio/a.ogg", speaker: null }],
      question: { kind: "dictation" as const },
      examMode: false,
      slowAudio: false,
    };
    render(<ReviewsScreen load={async () => due([cloze])} submit={async () => PASS} ghosts={async () => due([])} clips={async () => ({ clips: [clip] })} />);
    await screen.findByText("1 of 1");
    type("Answer", "みず");
    press("Check");
    await screen.findByRole("status");
    press("Next");
    expect(await screen.findByRole("heading", { name: "Listening" })).toBeTruthy();
    expect(screen.queryByText("Session complete.")).toBeNull();
  });

  it("walks through the due Reviews one by one", async () => {
    render(<ReviewsScreen load={async () => due([cloze, { ...cloze, exampleId: "ex-2" }])} submit={async () => PASS} ghosts={async () => due([])} clips={noClips} />);
    expect(await screen.findByText("1 of 2")).toBeTruthy();
    type("Answer", "みず");
    press("Check");
    await screen.findByRole("status");
    press("Next");
    expect(await screen.findByText("2 of 2")).toBeTruthy();
  });

  it("shows why it could not load", async () => {
    render(<ReviewsScreen load={async () => Promise.reject(new Error("log in first"))} clips={noClips} />);
    expect((await screen.findByRole("alert")).textContent).toBe("log in first");
  });
});

describe("Reviews by keyboard", () => {
  const key = (k: string, on: Element = document.body) => fireEvent.keyDown(on, { key: k });
  const markOn = (name: string) => screen.getByRole("button", { name }).querySelector("kbd")?.textContent;

  it("puts the cursor in the answer, checks on Enter, and moves on with Enter", async () => {
    const { submit, onDone } = mount();
    const field = screen.getByLabelText("Answer");
    expect(document.activeElement).toBe(field);
    expect(markOn("Check")).toBe("↵");
    expect(markOn("Show answer")).toBeUndefined();

    type("Answer", "みず");
    key("Enter", field);
    await screen.findByRole("status");
    expect(submit).toHaveBeenCalledOnce();
    expect(markOn("Next")).toBe("↵");
    key("Enter");
    expect(onDone).toHaveBeenCalledWith(PASS);
  });

  it("starts a Kanji in its first field and checks from the last", async () => {
    const { submit } = mount(kanji);
    expect(document.activeElement).toBe(screen.getByLabelText("Reading in this sentence"));
    type("Reading in this sentence", "みず");
    type("Meaning of the kanji", "water");
    key("Enter", screen.getByLabelText("Meaning of the kanji"));
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
  });

  it("leaves Enter on Hint to Hint, and a digit in the answer to the answer", () => {
    const { submit } = mount();
    expect(key("Enter", screen.getByRole("button", { name: "Hint" }))).toBe(true);
    expect(key("1", screen.getByLabelText("Answer"))).toBe(true);
    expect(submit).not.toHaveBeenCalled();
  });
});
