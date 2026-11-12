// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnswerResponse, ClipView } from "../contract.ts";
import { ListeningPractice } from "../web/ListeningPractice.tsx";

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

const dictation: ClipView = {
  clipId: "c1",
  exampleId: "e1",
  audio: [{ src: "/audio/a.ogg", speaker: "女" }],
  question: { kind: "dictation" },
  examMode: false,
  slowAudio: false,
};
const comprehension: ClipView = {
  ...dictation,
  question: { kind: "comprehension", prompt: "女の人は何をしますか。", choices: ["買い物", "勉強", "仕事", "料理"] },
};
const passed: AnswerResponse = {
  outcome: "pass",
  transcript: [{ speaker: "女", text: "パンを食べる。", translation: "I eat bread.", audio: "/audio/a.ogg" }],
};

const answers: unknown[] = [];
const stubServer = (view: ClipView, reply: AnswerResponse[] = [passed]) => {
  const replies = [...reply];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const json = (body: unknown) => new Response(JSON.stringify(body));
      if (url.includes("/answer")) return (answers.push(JSON.parse(init!.body as string)), json(replies.shift()));
      return url.includes("/clips?") ? json({ level: "N5", clipIds: ["c1"] }) : json(view);
    }),
  );
};

const stubAnswer = () => {
  const real = globalThis.fetch;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => (url.includes("/answer") ? new Response(JSON.stringify({ ...passed, outcome: "fail" })) : real(url, init))));
};

const open = async () => {
  render(<ListeningPractice />);
  fireEvent.click(screen.getByRole("button", { name: "N5" }));
  await screen.findByRole("button", { name: "Play" });
};

beforeEach(() => {
  plays.length = 0;
  answers.length = 0;
  vi.stubGlobal("Audio", FakeAudio);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Listening practice", () => {
  it("plays a clip, hides the text until the answer, then shows the transcript", async () => {
    stubServer(dictation);
    await open();
    expect(screen.queryByLabelText("What did you hear?")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    const box = await screen.findByLabelText("What did you hear?");
    expect(plays).toEqual([{ src: "/audio/a.ogg", rate: 1 }]);
    expect(screen.queryByText("パンを食べる。")).toBeNull();
    fireEvent.change(box, { target: { value: "ぱんをたべる" } });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText("パンを食べる。")).toBeTruthy();
    expect(screen.getByText("Correct")).toBeTruthy();
    expect(answers).toEqual([expect.objectContaining({ exampleId: "e1", input: "ぱんをたべる", replays: 0, slow: false, revealed: false })]);
  });

  it("counts replays and slow speed, and plays slow at 0.75×", async () => {
    stubServer(dictation);
    await open();
    fireEvent.click(screen.getByRole("checkbox", { name: /Slow/ }));
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    fireEvent.click(await screen.findByRole("button", { name: "Replay" }));
    await waitFor(() => expect(plays).toHaveLength(2));
    expect(plays.map((p) => p.rate)).toEqual([0.75, 0.75]);
    fireEvent.change(screen.getByLabelText("What did you hear?"), { target: { value: "ぱん" } });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    await screen.findByText("Correct");
    expect(answers[0]).toMatchObject({ replays: 1, slow: true });
  });

  it("starts slow when the Learner's setting says so", async () => {
    stubServer({ ...dictation, slowAudio: true });
    await open();
    expect((screen.getByRole("checkbox", { name: /Slow/ }) as HTMLInputElement).checked).toBe(true);
  });

  it("in Exam Mode shows the question first, plays once, and offers no replay or slow speed", async () => {
    stubServer({ ...comprehension, examMode: true });
    await open();
    expect(screen.getByText("女の人は何をしますか。")).toBeTruthy();
    expect(screen.getByRole("button", { name: "仕事" })).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    await screen.findByText("Played once");
    expect(screen.queryByRole("button", { name: "Replay" })).toBeNull();
    expect((screen.getByRole("button", { name: "Play" }) as HTMLButtonElement).disabled).toBe(true);
    expect(plays).toHaveLength(1);
  });

  it("asks the comprehension question only after the first play, and sends the option chosen", async () => {
    stubServer(comprehension, [{ ...passed, correctChoice: "買い物" }]);
    await open();
    expect(screen.queryByRole("button", { name: "買い物" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    fireEvent.click(await screen.findByRole("button", { name: "買い物" }));
    await screen.findByText("Correct");
    expect(answers[0]).toMatchObject({ input: "買い物" });
    expect(screen.getByText("買い物")).toBeTruthy();
  });

  it("counts Show answer as a fail and shows the transcript", async () => {
    stubServer(dictation, [{ ...passed, outcome: "fail" }]);
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    expect(await screen.findByText("Not quite")).toBeTruthy();
    expect(answers[0]).toMatchObject({ revealed: true });
  });

  it("asks again when the input was not an answer, and sends that try with the graded one", async () => {
    stubServer(dictation, [{ outcome: "retry" }, passed]);
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    const box = await screen.findByLabelText("What did you hear?");
    fireEvent.change(box, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    await waitFor(() => expect(answers).toHaveLength(1));
    const again = await screen.findByLabelText("What did you hear?");
    fireEvent.change(again, { target: { value: "ぱん" } });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    await screen.findByText("Correct");
    expect(answers[1]).toMatchObject({ input: "ぱん", attempts: [""] });
  });

  it("moves to the next clip", async () => {
    stubServer(dictation, [passed]);
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    fireEvent.click(await screen.findByRole("button", { name: "Next clip" }));
    expect(await screen.findByRole("button", { name: "Play" })).toBeTruthy();
  });

  it("clears the box after a retry", async () => {
    stubServer(dictation, [{ outcome: "retry" }, passed]);
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    fireEvent.change(await screen.findByLabelText("What did you hear?"), { target: { value: "あ" } });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    await waitFor(() => expect((screen.getByLabelText("What did you hear?") as HTMLInputElement).value).toBe(""));
  });

  it("sends how long the Learner took", async () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(1_000).mockReturnValue(4_500);
    stubServer(dictation, [{ ...passed, outcome: "fail" }]);
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    await screen.findByText("Not quite");
    expect(answers[0]).toMatchObject({ timeToAnswerMs: 3_500 });
    vi.restoreAllMocks();
  });

  it("shows each transcript line with only what it has, and the answer to a question", async () => {
    const lines = [
      { speaker: "女", text: "一行目", translation: "line one", audio: "/audio/1.ogg" },
      { speaker: null, text: "二行目", translation: null, audio: null },
    ];
    stubServer(comprehension, [{ outcome: "fail", transcript: lines, correctChoice: "買い物" }]);
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    await screen.findByText("Not quite");
    expect(screen.getByText("Answer:").textContent).toContain("買い物");
    expect(screen.getByText("Not quite").className).toBe("pill");
    const [first, second] = screen.getAllByRole("listitem");
    expect(first.querySelectorAll("b, details, audio")).toHaveLength(3);
    expect(second.querySelectorAll("b, details, audio")).toHaveLength(0);
    expect(second.textContent).toBe("二行目");
    expect(screen.getByText("line one")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Play line/ }).map((b) => b.getAttribute("aria-label"))).toEqual(["Play line 1"]);
  });

  it("shows no answer line and a ink pill when a dictation passes", async () => {
    stubServer(dictation, [passed]);
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    expect((await screen.findByText("Correct")).className).toBe("pill pill--ink");
    expect(screen.queryByText("Answer:")).toBeNull();
  });

  it("marks the chosen level", async () => {
    stubServer(dictation);
    render(<ListeningPractice />);
    fireEvent.click(screen.getByRole("button", { name: "N5" }));
    expect(screen.getByRole("button", { name: "N5" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "N5" }).className).toBe("btn btn--primary");
    expect(screen.getByRole("button", { name: "N4" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "N4" }).className).toBe("btn");
    await screen.findByRole("button", { name: "Play" });
  });

  it("says when a level has no clips", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ level: "N1", clipIds: [] }))));
    render(<ListeningPractice />);
    fireEvent.click(screen.getByRole("button", { name: "N1" }));
    expect(await screen.findByText("No N1 clips yet. Pick another level above, or read at your level instead.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Reading" }).getAttribute("href")).toBe("/reading");
  });

  it("walks the clips in order and starts over from the first when the level changes", async () => {
    const asked: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const json = (body: unknown) => new Response(JSON.stringify(body));
        if (url.includes("/clips?")) return json({ level: "N5", clipIds: ["c1", "c2"] });
        asked.push(url);
        return json({ ...dictation, clipId: url.split("/").pop() });
      }),
    );
    render(<ListeningPractice />);
    fireEvent.click(screen.getByRole("button", { name: "N5" }));
    await screen.findByRole("button", { name: "Play" });
    expect(asked.at(-1)).toMatch(/c1$/);
    stubAnswer();
    fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
    fireEvent.click(await screen.findByRole("button", { name: "Next clip" }));
    await waitFor(() => expect(asked.at(-1)).toMatch(/c2$/));
    await screen.findByRole("button", { name: "Play" });
    fireEvent.click(screen.getByRole("button", { name: "N4" }));
    await waitFor(() => expect(asked.at(-1)).toMatch(/c1$/));
  });

  it("holds the Play button while the clip is playing", async () => {
    let finish = () => {};
    vi.stubGlobal(
      "Audio",
      class extends FakeAudio {
        async play() {
          await new Promise<void>((done) => (finish = () => (this.onended?.(), done())));
        }
      },
    );
    stubServer(dictation);
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    await waitFor(() => expect((screen.getByRole("button", { name: /Play|Replay/ }) as HTMLButtonElement).disabled).toBe(true));
    finish();
    await waitFor(() => expect((screen.getByRole("button", { name: "Replay" }) as HTMLButtonElement).disabled).toBe(false));
  });
});
