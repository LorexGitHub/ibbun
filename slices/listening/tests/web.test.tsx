// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

const clip: ClipView = {
  clipId: "c1",
  exampleId: "e1",
  audio: [{ src: "/audio/a.ogg", speaker: "女" }],
  question: { prompt: "女の人は何をしますか。", choices: ["買い物", "勉強", "仕事", "料理"] },
  examMode: false,
  slowAudio: false,
};
const passed: AnswerResponse = {
  outcome: "pass",
  transcript: [{ speaker: "女", text: "パンを食べる。", translation: "I eat bread.", audio: "/audio/a.ogg" }],
  correctChoice: "買い物",
};
const failed: AnswerResponse = { ...passed, outcome: "fail" };

const json = (body: unknown) => new Response(JSON.stringify(body));
const answers: unknown[] = [];
const stubServer = (view: ClipView = clip, reply: AnswerResponse[] = [passed]) => {
  const replies = [...reply];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/answer")) return (answers.push(JSON.parse(init!.body as string)), json(replies.shift()));
      return url.includes("/clips?") ? json({ level: "N5", clipIds: ["c1"] }) : json(view);
    }),
  );
};

/** Serves these clip ids for any level; `missing` ones answer 404. Records each clip asked for. */
const stubClips = (clipIds: string[], missing: string[] = []) => {
  const asked: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/clips?")) return json({ level: "N5", clipIds });
      if (url.includes("/answer")) return json(failed);
      if (url.includes("/practice")) return json(clip);
      const clipId = url.split("/").pop()!;
      asked.push(clipId);
      return missing.includes(clipId) ? new Response("{}", { status: 404 }) : json({ ...clip, clipId });
    }),
  );
  return asked;
};

const button = (name: string | RegExp) => screen.getByRole("button", { name }) as HTMLButtonElement;
const press = (name: string | RegExp) => fireEvent.click(button(name));
const key = (k: string) => fireEvent.keyDown(document.body, { key: k });

const open = async () => {
  render(<ListeningPractice />);
  await screen.findByRole("button", { name: "Play" });
};
const openAndPlay = async () => {
  await open();
  press("Play");
  await screen.findByRole("button", { name: "買い物" });
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

describe("the Listening screen", () => {
  it("opens on the N5 player with nothing to pick first, and shows no list of clips", async () => {
    stubServer();
    await open();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Listening");
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe("/api/listening/clips?level=N5");
    expect(button("N5").getAttribute("aria-pressed")).toBe("true");
    expect(button("N5").className).toBe("pill pill--ink");
    expect(button("N4").getAttribute("aria-pressed")).toBe("false");
    expect(button("N4").className).toBe("pill");
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("plays the clip, asks only after the first play, and shows the text only after the answer", async () => {
    stubServer();
    await open();
    expect(screen.queryByText("女の人は何をしますか。")).toBeNull();
    expect(screen.queryByRole("button", { name: "買い物" })).toBeNull();
    press("Play");
    await screen.findByText("女の人は何をしますか。");
    expect(plays).toEqual([{ src: "/audio/a.ogg", rate: 1 }]);
    expect(screen.queryByText("パンを食べる。")).toBeNull();
    press("買い物");
    expect(await screen.findByText("パンを食べる。")).toBeTruthy();
    expect(screen.getByText("Correct")).toBeTruthy();
    expect(answers).toEqual([expect.objectContaining({ exampleId: "e1", input: "買い物", attempts: [], replays: 0, slow: false, revealed: false })]);
  });

  it("has no field to type into", async () => {
    stubServer();
    await openAndPlay();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Check" })).toBeNull();
  });

  it("offers Again only once the clip has played, and counts each one as a replay", async () => {
    stubServer();
    await open();
    expect(button("Again").disabled).toBe(true);
    press("Play");
    await waitFor(() => expect(button("Again").disabled).toBe(false));
    press("Again");
    await waitFor(() => expect(plays).toHaveLength(2));
    await waitFor(() => expect(button("Again").disabled).toBe(false));
    press("買い物");
    await screen.findByText("Correct");
    expect(answers[0]).toMatchObject({ replays: 1, slow: false });
  });

  it("plays at 0.75× once that speed is picked, and says so with the answer", async () => {
    stubServer();
    await open();
    const speed = within(screen.getByRole("group", { name: "Speed" }));
    expect(speed.getAllByRole("button").map((b) => [b.textContent, b.getAttribute("aria-pressed")])).toEqual([["1×", "true"], ["0.75×", "false"]]);
    press("0.75×");
    expect([button("1×").className, button("0.75×").className]).toEqual(["pill", "pill pill--ink"]);
    press("Play");
    press(await screen.findByRole("button", { name: "買い物" }).then(() => "買い物"));
    await screen.findByText("Correct");
    expect(plays).toEqual([{ src: "/audio/a.ogg", rate: 0.75 }]);
    expect(answers[0]).toMatchObject({ slow: true });
  });

  it("goes back to full speed", async () => {
    stubServer({ ...clip, slowAudio: true });
    await open();
    press("1×");
    press("Play");
    await waitFor(() => expect(plays).toEqual([{ src: "/audio/a.ogg", rate: 1 }]));
  });

  it("starts slow when the Learner's setting says so", async () => {
    stubServer({ ...clip, slowAudio: true });
    await open();
    expect([button("1×").getAttribute("aria-pressed"), button("0.75×").getAttribute("aria-pressed")]).toEqual(["false", "true"]);
  });

  it("plays every line of a dialogue in order", async () => {
    stubServer({ ...clip, audio: [{ src: "/audio/1.ogg", speaker: "男" }, { src: "/audio/2.ogg", speaker: "女" }] });
    await open();
    press("Play");
    await waitFor(() => expect(plays.map((p) => p.src)).toEqual(["/audio/1.ogg", "/audio/2.ogg"]));
  });

  it("in Exam Mode shows the question first, plays once, and offers no Again or speed", async () => {
    stubServer({ ...clip, examMode: true, slowAudio: true });
    await open();
    expect(screen.getByText("女の人は何をしますか。")).toBeTruthy();
    expect(button("仕事")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Speed" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Again" })).toBeNull();
    expect(screen.queryByText("Played once")).toBeNull();
    press("Play");
    await screen.findByText("Played once");
    await waitFor(() => expect(screen.getByRole("button", { name: "Play" }).closest(".player")!.getAttribute("data-playing")).toBe("false"));
    expect(button("Play").disabled).toBe(true);
    expect(plays).toEqual([{ src: "/audio/a.ogg", rate: 1 }]);
  });

  it("counts Show answer as a fail and shows the transcript", async () => {
    stubServer(clip, [failed]);
    await open();
    press("Show answer");
    expect(await screen.findByText("Not quite")).toBeTruthy();
    expect(answers[0]).toMatchObject({ input: "", revealed: true });
  });

  it("asks again when the server took no answer, and sends that try with the graded one", async () => {
    stubServer(clip, [{ outcome: "retry" }, passed]);
    await openAndPlay();
    press("勉強");
    await waitFor(() => expect(answers).toHaveLength(1));
    expect(screen.queryByText("Correct")).toBeNull();
    await waitFor(() => (press("買い物"), expect(answers).toHaveLength(2)));
    await screen.findByText("Correct");
    expect(answers[1]).toMatchObject({ input: "買い物", attempts: ["勉強"] });
  });

  it("sends one answer when an option is pressed twice before the server replies", async () => {
    stubServer();
    await openAndPlay();
    press("買い物");
    press("勉強");
    await screen.findByText("Correct");
    expect(answers).toEqual([expect.objectContaining({ input: "買い物" })]);
  });

  it("moves to the next clip", async () => {
    stubServer();
    await open();
    press("Show answer");
    press(await screen.findByRole("button", { name: "Next clip" }).then(() => "Next clip"));
    expect(await screen.findByRole("button", { name: "Play" })).toBeTruthy();
    expect(screen.queryByText("Correct")).toBeNull();
  });

  it("sends how long the Learner took", async () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(1_000).mockReturnValue(4_500);
    stubServer(clip, [failed]);
    await open();
    press("Show answer");
    await screen.findByText("Not quite");
    expect(answers[0]).toMatchObject({ timeToAnswerMs: 3_500 });
    vi.restoreAllMocks();
  });

  it("shows the right option, and each transcript line with only what it has", async () => {
    const lines = [
      { speaker: "女" as const, text: "一行目", translation: "line one", audio: "/audio/1.ogg" },
      { speaker: null, text: "二行目", translation: null, audio: null },
    ];
    stubServer(clip, [{ outcome: "fail", transcript: lines, correctChoice: "買い物" }]);
    await open();
    press("Show answer");
    await screen.findByText("Not quite");
    expect(screen.getByText("Answer:").textContent).toBe("Answer: 買い物");
    expect(screen.getByText("Not quite").className).toBe("pill");
    const [first, second] = screen.getAllByRole("listitem");
    expect(first!.querySelectorAll("b, details, audio")).toHaveLength(3);
    expect(second!.querySelectorAll("b, details, audio")).toHaveLength(0);
    expect(second!.textContent).toBe("二行目");
    expect(screen.getByText("line one")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Play line/ }).map((b) => b.getAttribute("aria-label"))).toEqual(["Play line 1"]);
  });

  it("marks a pass in ink", async () => {
    stubServer();
    await openAndPlay();
    press("買い物");
    expect((await screen.findByText("Correct")).className).toBe("pill pill--ink");
  });

  it("holds Play and Again while the clip is playing, and moves the sound", async () => {
    let finish = () => {};
    vi.stubGlobal(
      "Audio",
      class extends FakeAudio {
        async play() {
          await new Promise<void>((done) => (finish = () => (this.onended?.(), done())));
        }
      },
    );
    stubServer();
    await open();
    const player = button("Play").closest(".player")!;
    expect(player.getAttribute("data-playing")).toBe("false");
    press("Play");
    await waitFor(() => expect(button("Play").disabled).toBe(true));
    expect(button("Again").disabled).toBe(true);
    expect(player.getAttribute("data-playing")).toBe("true");
    finish();
    await waitFor(() => expect(button("Play").disabled).toBe(false));
    expect(button("Again").disabled).toBe(false);
    expect(player.getAttribute("data-playing")).toBe("false");
  });

  it("goes on when a line cannot be played", async () => {
    vi.stubGlobal(
      "Audio",
      class extends FakeAudio {
        async play() {
          throw new Error("no autoplay");
        }
      },
    );
    stubServer();
    await open();
    press("Play");
    await waitFor(() => expect(button("Again").disabled).toBe(false));
  });
});

describe("the Listening screen's level", () => {
  it("changes to the level the Learner presses", async () => {
    stubServer();
    await open();
    press("N4");
    expect(button("N4").getAttribute("aria-pressed")).toBe("true");
    expect(button("N5").getAttribute("aria-pressed")).toBe("false");
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toContain("/api/listening/clips?level=N4"));
  });

  it("comes from the Level filter, which then stands in for the level buttons", async () => {
    history.replaceState(null, "", "/listening?level=n3");
    stubServer();
    await open();
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe("/api/listening/clips?level=N3");
    expect(screen.queryByRole("group", { name: "Level" })).toBeNull();
    history.replaceState(null, "", "/");
  });

  it("says when a level has no clips", async () => {
    stubClips([]);
    render(<ListeningPractice />);
    press("N1");
    expect(await screen.findByText("No N1 clips yet. Pick another level, or read at your level instead.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Reading" }).getAttribute("href")).toBe("/reading");
    expect(screen.queryByRole("button", { name: "Play" })).toBeNull();
  });

  it("walks the clips in order and starts over from the first when the level changes", async () => {
    const asked = stubClips(["c1", "c2"]);
    await open();
    expect(asked).toEqual(["c1"]);
    press("Show answer");
    fireEvent.click(await screen.findByRole("button", { name: "Next clip" }));
    await waitFor(() => expect(asked).toEqual(["c1", "c2"]));
    await screen.findByRole("button", { name: "Play" });
    press("N4");
    await waitFor(() => expect(asked).toEqual(["c1", "c2", "c1"]));
  });

  it("wraps round to the first clip after the last", async () => {
    const asked = stubClips(["c1"]);
    await open();
    press("Show answer");
    fireEvent.click(await screen.findByRole("button", { name: "Next clip" }));
    await waitFor(() => expect(asked).toEqual(["c1", "c1"]));
  });

  it("leaves out a clip that cannot be served and plays the next one", async () => {
    const asked = stubClips(["c1", "c2"], ["c1"]);
    await open();
    expect(asked).toEqual(["c1", "c2"]);
  });

  it("says the level has no clips when none of them can be served", async () => {
    stubClips(["c1", "c2"], ["c1", "c2"]);
    render(<ListeningPractice />);
    expect(await screen.findByText(/No N5 clips yet/)).toBeTruthy();
  });
});

describe("the Listening screen by keyboard", () => {
  const markOn = (name: string) => button(name).querySelector("kbd")?.textContent;

  it("picks an option with 1 to 4, and takes the next clip on Enter", async () => {
    stubServer();
    await openAndPlay();
    expect(["買い物", "勉強", "仕事", "料理"].map(markOn)).toEqual(["1", "2", "3", "4"]);
    key("4");
    await screen.findByText("Correct");
    expect(answers).toEqual([expect.objectContaining({ input: "料理" })]);

    expect(markOn("Next clip")).toBe("↵");
    key("Enter");
    await waitFor(() => expect(screen.queryByText("Correct")).toBeNull());
  });

  it("has no option under a fifth key", async () => {
    stubServer();
    await openAndPlay();
    key("5");
    key("0");
    key("1");
    await screen.findByText("Correct");
    expect(answers).toEqual([expect.objectContaining({ input: "買い物" })]);
  });
});

describe("a Practice Text dialogue on the Listening screen", () => {
  const dialogue: ClipView = { ...clip, clipId: "t1", exampleId: "0" };
  const entry = { id: "t1", level: "N5", passageType: "any", length: "short", at: "2026-03-01T09:00:00Z", ready: true };

  it("takes the screen while it plays, so there is one player and one set of keys, and gives it back after", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/practice/options")) return json({ cleared: ["N5"], remaining: 3 });
        if (url.endsWith("/practice")) return json([entry]);
        if (url.includes("/practice/")) return json(dialogue);
        return url.includes("/clips?") ? json({ level: "N5", clipIds: ["c1"] }) : json(clip);
      }),
    );
    render(<ListeningPractice />);
    await screen.findByRole("button", { name: "Play" });
    fireEvent.click(await screen.findByRole("button", { name: "Listen" }));
    await screen.findByRole("heading", { name: "Practice dialogue" });
    const free = screen.getByText("Listening", { selector: "h1" }).closest("section")!;
    await waitFor(() => expect(free.hasAttribute("hidden")).toBe(true));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Play" })).toHaveLength(1));

    press("Back to your dialogues");
    await waitFor(() => expect(free.hasAttribute("hidden")).toBe(false));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Play" })).toHaveLength(1));
  });
});
