// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudyItemId } from "@mojibun/shared";
import type { ClipAnswerRequest, ClipAnswerResponse, ClipReview } from "../contract.ts";
import { answerClip, loadDueClips } from "../web/clip-reviews-client.ts";
import { ListeningReviews } from "../web/ListeningReviews.tsx";

const plays: { src: string; rate: number }[] = [];

class FakeAudio {
  playbackRate = 1;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly src: string) {}
  async play() {
    plays.push({ src: this.src, rate: this.playbackRate });
    queueMicrotask(() => this.onended?.());
  }
}

const dictation: ClipReview = {
  clipId: StudyItemId.parse("00000000-0000-4000-8000-000000000001"),
  exampleId: "e1",
  audio: [{ src: "/audio/a.ogg", speaker: "女" }],
  question: { kind: "dictation" },
  examMode: false,
  slowAudio: false,
};
const comprehension: ClipReview = {
  ...dictation,
  question: { kind: "comprehension", prompt: "女の人は何をしますか。", choices: ["買い物", "勉強", "仕事", "料理"] },
};
const transcript = [{ speaker: "女" as const, text: "パンを食べる。", translation: "I eat bread.", audio: "/audio/a.ogg" }];
const passed: ClipAnswerResponse = { outcome: "pass", transcript };

const sent: ClipAnswerRequest[] = [];
const mount = (clips: ClipReview[], replies: ClipAnswerResponse[] = [passed]) => {
  const queue = [...replies];
  const answer = vi.fn(async (request: ClipAnswerRequest) => (sent.push(request), queue.shift()!));
  render(<ListeningReviews load={async () => ({ clips })} answer={answer} empty={<p>No Reviews are due.</p>} />);
  return answer;
};
const play = () => fireEvent.click(screen.getByRole("button", { name: "Play" }));
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  plays.length = 0;
  sent.length = 0;
  vi.stubGlobal("Audio", FakeAudio);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("scheduled Listening Clip Reviews", () => {
  it("shows the empty state when no clip is due", async () => {
    mount([]);
    expect(await screen.findByText("No Reviews are due.")).toBeTruthy();
  });

  it("shows an error when the due clips cannot be loaded", async () => {
    render(<ListeningReviews load={() => Promise.reject(new Error("log in first"))} empty={null} />);
    expect((await screen.findByRole("alert")).textContent).toBe("log in first");
  });

  it("plays the clip, hides the text until answered, then shows the transcript", async () => {
    mount([dictation]);
    await screen.findByRole("button", { name: "Play" });
    expect(screen.queryByLabelText("What did you hear?")).toBeNull();
    play();
    fireEvent.change(await screen.findByLabelText("What did you hear?"), { target: { value: "ぱんをたべる" } });
    expect(screen.queryByText("パンを食べる。")).toBeNull();
    press("Check");
    expect(await screen.findByText("パンを食べる。")).toBeTruthy();
    expect(screen.getByText("Correct")).toBeTruthy();
    expect(sent).toEqual([expect.objectContaining({ clipId: dictation.clipId, exampleId: "e1", input: "ぱんをたべる", replays: 0, slow: false })]);
  });

  it("allows unlimited replays, counts them, and plays slow at 0.75×", async () => {
    mount([dictation]);
    fireEvent.click(await screen.findByRole("checkbox", { name: /Slow/ }));
    play();
    for (let i = 0; i < 3; i++) fireEvent.click(await screen.findByRole("button", { name: "Replay" }));
    await waitFor(() => expect(plays).toHaveLength(4));
    expect(plays.map((p) => p.rate)).toEqual([0.75, 0.75, 0.75, 0.75]);
    fireEvent.change(screen.getByLabelText("What did you hear?"), { target: { value: "ぱん" } });
    press("Check");
    await screen.findByText("Correct");
    expect(sent[0]).toMatchObject({ replays: 3, slow: true });
  });

  it("starts slow when the Learner's setting says so", async () => {
    mount([{ ...dictation, slowAudio: true }]);
    expect(((await screen.findByRole("checkbox", { name: /Slow/ })) as HTMLInputElement).checked).toBe(true);
  });

  it("in Exam Mode shows the question first, plays once, and offers no replay or slow speed", async () => {
    mount([{ ...comprehension, examMode: true }]);
    await screen.findByRole("button", { name: "Play" });
    expect(screen.getByText("女の人は何をしますか。")).toBeTruthy();
    expect(screen.getByRole("button", { name: "仕事" })).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
    play();
    await screen.findByText("Played once");
    expect(screen.queryByRole("button", { name: "Replay" })).toBeNull();
    expect((screen.getByRole("button", { name: "Play" }) as HTMLButtonElement).disabled).toBe(true);
    expect(plays).toHaveLength(1);
  });

  it("in Exam Mode shows a dictation as just its input box", async () => {
    mount([{ ...dictation, examMode: true }]);
    expect(await screen.findByLabelText("What did you hear?")).toBeTruthy();
  });

  it("asks a comprehension question only after the first play, and sends the option chosen", async () => {
    mount([comprehension], [{ ...passed, correctChoice: "買い物" }]);
    await screen.findByRole("button", { name: "Play" });
    expect(screen.queryByRole("button", { name: "買い物" })).toBeNull();
    play();
    fireEvent.click(await screen.findByRole("button", { name: "買い物" }));
    await screen.findByText("Correct");
    expect(sent[0]).toMatchObject({ input: "買い物" });
  });

  it("shows the answer to a failed comprehension question", async () => {
    mount([comprehension], [{ outcome: "fail", transcript, correctChoice: "買い物" }]);
    fireEvent.click(await screen.findByRole("button", { name: "Show answer" }));
    await screen.findByText("Not quite");
    expect(screen.getByText("Answer:").textContent).toContain("買い物");
    expect(sent[0]).toMatchObject({ revealed: true });
  });

  it("shows a per-token diff on a failed dictation", async () => {
    const diff = [
      { surface: "パン", reading: "パン", status: "correct" as const },
      { surface: "を", reading: "ヲ", status: "missing" as const },
      { surface: "食べる", reading: "タベル", status: "wrong" as const, typed: "食べた" },
    ];
    mount([dictation], [{ outcome: "fail", transcript, diff, extra: "よ" }]);
    fireEvent.click(await screen.findByRole("button", { name: "Show answer" }));
    const items = await screen.findAllByRole("listitem");
    const rows = items.filter((li) => li.hasAttribute("data-status"));
    expect(rows.map((li) => li.getAttribute("data-status"))).toEqual(["correct", "missing", "wrong"]);
    expect(rows[1]!.textContent).toContain("を");
    expect(rows[1]!.textContent).toContain("ヲ");
    expect(rows[2]!.textContent).toContain("食べた");
    expect(screen.getByText("Extra:").textContent).toContain("よ");
  });

  it("shows no diff when a dictation passes", async () => {
    mount([dictation]);
    fireEvent.click(await screen.findByRole("button", { name: "Show answer" }));
    await screen.findByText("Correct");
    expect(screen.queryByLabelText("Dictation diff")).toBeNull();
  });

  it("asks again when the input was not an answer, sending that try with the graded one", async () => {
    mount([dictation], [{ outcome: "retry" }, passed]);
    await screen.findByRole("button", { name: "Play" });
    play();
    fireEvent.change(await screen.findByLabelText("What did you hear?"), { target: { value: "" } });
    press("Check");
    await waitFor(() => expect(sent).toHaveLength(1));
    fireEvent.change(await screen.findByLabelText("What did you hear?"), { target: { value: "ぱん" } });
    press("Check");
    await screen.findByText("Correct");
    expect(sent[1]).toMatchObject({ input: "ぱん", attempts: [""] });
  });

  it("walks through the due clips one by one", async () => {
    mount([dictation, comprehension], [passed, passed]);
    expect(await screen.findByText("1 of 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    expect(await screen.findByText("2 of 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    expect(await screen.findByText("No Reviews are due.")).toBeTruthy();
  });

  it("sends how long the Learner took", async () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(1_000).mockReturnValue(4_500);
    mount([dictation], [{ outcome: "fail", transcript }]);
    fireEvent.click(await screen.findByRole("button", { name: "Show answer" }));
    await screen.findByText("Not quite");
    expect(sent[0]).toMatchObject({ timeToAnswerMs: 3_500 });
    vi.restoreAllMocks();
  });

  it("shows each transcript line with only what it has", async () => {
    const lines = [
      { speaker: "女" as const, text: "一行目", translation: "line one", audio: "/audio/1.ogg" },
      { speaker: null, text: "二行目", translation: null, audio: null },
    ];
    mount([dictation], [{ outcome: "fail", transcript: lines }]);
    fireEvent.click(await screen.findByRole("button", { name: "Show answer" }));
    await screen.findByText("Not quite");
    const [first, second] = screen.getByRole("list", { name: "Transcript" }).querySelectorAll(":scope > li");
    expect(first!.querySelectorAll("b, details, audio")).toHaveLength(3);
    expect(second!.querySelectorAll("b, details, audio")).toHaveLength(0);
    expect(second!.textContent).toBe("二行目");
  });
});

describe("the listening Review client", () => {
  const respond = (body: unknown, ok = true) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: ok ? 200 : 500 })));

  it("loads the due clips from the reviews API", async () => {
    respond({ clips: [dictation] });
    expect(await loadDueClips()).toEqual({ clips: [dictation] });
    expect(fetch).toHaveBeenCalledWith("/api/reviews/listening/due", expect.anything());
  });

  it("posts an answer as JSON and parses the response", async () => {
    respond(passed);
    expect(await answerClip({ clipId: dictation.clipId, exampleId: "e1", input: "ぱん" })).toEqual(passed);
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe("/api/reviews/listening/answer");
    expect(init).toMatchObject({ method: "POST", headers: { "content-type": "application/json" } });
    expect(JSON.parse(init!.body as string)).toMatchObject({ input: "ぱん" });
  });

  it("throws when the server refuses", async () => {
    respond({ message: "boom" }, false);
    await expect(loadDueClips()).rejects.toThrow("boom");
  });
});
