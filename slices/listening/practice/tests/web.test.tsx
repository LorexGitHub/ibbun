// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClipView } from "../../contract.ts";
import type { LibraryEntry, Options } from "../practice-contract.ts";
import { PracticeTexts, WAIT_MS } from "../web/PracticeTexts.tsx";

class FakeAudio {
  playbackRate = 1;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly src: string) {}
  async play() {
    queueMicrotask(() => this.onended?.());
  }
}

const view: ClipView = {
  clipId: "t1",
  exampleId: "0",
  audio: [{ src: "/audio/d0.ogg", speaker: "男" }],
  question: { prompt: "女の人は何をしますか。", choices: ["買い物", "勉強", "仕事", "料理"] },
  examMode: false,
  slowAudio: false,
};
const entry: LibraryEntry = { id: "t1", level: "N5", passageType: "any", length: "short", at: "2026-03-01T09:00:00Z", ready: true };

type Server = { options: Options; library: LibraryEntry[]; generate: () => Response; practice: () => Response };
const calls: { url: string; init?: RequestInit }[] = [];
const serve = (over: Partial<Server> = {}) => {
  const server: Server = {
    options: { cleared: ["N5"], remaining: 3 },
    library: [],
    generate: () => Response.json({ id: "t1" }, { status: 202 }),
    practice: () => Response.json(view),
    ...over,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/options")) return Response.json(server.options);
      if (init?.method === "POST" && url.endsWith("/practice")) return server.generate();
      if (url.endsWith("/practice")) return Response.json(server.library);
      if (url.includes("/answer")) return Response.json({ outcome: "pass", transcript: [{ speaker: "男", text: "こんにちは。", translation: null, audio: null }], correctChoice: "買い物" });
      return server.practice();
    }),
  );
};

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal("Audio", FakeAudio);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const generateWith = async () => {
  render(<PracticeTexts />);
  fireEvent.click(await screen.findByRole("button", { name: "Generate a dialogue" }));
};

describe("Practice dialogues", () => {
  it("tells a Learner with no Cleared Level how to unlock them, and offers no form", async () => {
    serve({ options: { cleared: [], remaining: 5 } });
    render(<PracticeTexts />);
    expect(await screen.findByText(/Know every Kanji of a level/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Generate a dialogue" })).toBeNull();
  });

  it("offers only the Cleared Levels and the level's own question types, and sends the fixed choices", async () => {
    serve({ options: { cleared: ["N5", "N3"], remaining: 3 } });
    render(<PracticeTexts />);
    const level = (await screen.findByLabelText("Level")) as HTMLSelectElement;
    expect([...level.options].map((o) => o.value)).toEqual(["N5", "N3"]);
    const types = () => [...(screen.getByLabelText("Question type") as HTMLSelectElement).options].map((o) => o.value);
    expect(types()).toEqual(["any", "課題理解", "ポイント理解"]);
    fireEvent.change(level, { target: { value: "N3" } });
    expect(types()).toContain("概要理解");
    fireEvent.change(screen.getByLabelText("Topic"), { target: { value: "旅行" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate a dialogue" }));
    await screen.findByRole("button", { name: "Play" });
    const post = calls.find((c) => c.init?.method === "POST")!;
    expect(JSON.parse(post.init!.body as string)).toEqual({ level: "N3", passageType: "any", length: "short", topic: "旅行" });
  });

  it("plays the new dialogue and sends the answer to the Practice Text's own route", async () => {
    serve();
    await generateWith();
    fireEvent.click(await screen.findByRole("button", { name: "Play" }));
    fireEvent.click(await screen.findByRole("button", { name: "買い物" }));
    expect(await screen.findByText("Correct")).toBeTruthy();
    expect(calls.some((c) => c.url === "/api/listening/practice/t1/answer")).toBe(true);
    expect(screen.getByRole("button", { name: "Next question" })).toBeTruthy();
  });

  it("shows the server's try-again-tomorrow message instead of a dialogue", async () => {
    serve({ generate: () => Response.json({ message: "Try again tomorrow." }, { status: 429 }) });
    await generateWith();
    expect(await screen.findByText("Try again tomorrow.")).toBeTruthy();
  });

  it("says there are none left today without a form", async () => {
    serve({ options: { cleared: ["N5"], remaining: 0 } });
    render(<PracticeTexts />);
    expect(await screen.findByText(/Try again tomorrow/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Generate a dialogue" })).toBeNull();
  });

  it("stops waiting after 20 s and says the dialogue will be in the library", async () => {
    serve({ practice: () => Response.json({ status: "pending" }, { status: 202 }) });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await generateWith();
    await act(() => vi.advanceTimersByTimeAsync(WAIT_MS + 2_000));
    await waitFor(() => expect(screen.getByText(/appear in your library/)).toBeTruthy());
  });

  it("lists the library, opening a ready dialogue and marking one still being made", async () => {
    serve({ library: [entry, { ...entry, id: "t2", ready: false }] });
    render(<PracticeTexts />);
    expect(await screen.findByText("Being made…")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Listen" }));
    expect(await screen.findByRole("button", { name: "Play" })).toBeTruthy();
  });
});
