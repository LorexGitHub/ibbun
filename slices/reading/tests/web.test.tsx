// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EpisodeLists, LookupView, TextView } from "../contract.ts";
import { EpisodeList } from "../web/EpisodeList.tsx";
import { TextReader } from "../web/TextReader.tsx";

afterEach(cleanup);

const WORD = "00000000-0000-7000-8000-00000000000a";
const text: TextView = {
  title: "朝ごはん",
  episode: { level: "N5", number: 2 },
  credits: [{ text: "Tatoeba", href: "https://tatoeba.org" }],
  sentences: [
    {
      id: "00000000-0000-7000-8000-000000000002",
      translation: "I eat bread.",
      runs: [
        { text: "パン", reading: null, wordId: null, inBatch: false },
        { text: "食べる", reading: "たべる", wordId: WORD as never, inBatch: true },
      ],
    },
    { id: "00000000-0000-7000-8000-000000000003", translation: null, runs: [{ text: "見る", reading: null, wordId: null, inBatch: false }] },
  ],
};

describe("TextReader", () => {
  it("hides a Sentence's translation until the Learner taps it, and offers none where there is none", () => {
    render(<TextReader text={text} onLookup={vi.fn()} />);
    expect(screen.queryByText("I eat bread.")).toBeNull();
    expect(screen.getAllByRole("button", { name: "Show translation" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Show translation" }));
    expect(screen.getByText("I eat bread.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Show translation" })).toBeNull();
  });

  it("draws furigana only where the server sent a reading, and marks the batch's Words", () => {
    const { container } = render(<TextReader text={text} onLookup={vi.fn()} />);
    expect(container.querySelectorAll("rt")).toHaveLength(1);
    expect(container.querySelector("rt")?.textContent).toBe("たべる");
    expect(screen.getByRole("button", { name: /食べる/ }).getAttribute("data-in-batch")).toBe("true");
    expect(screen.queryByRole("button", { name: /パン/ })).toBeNull();
  });

  it("looks a Word up when tapped and shows what it means", async () => {
    const lookup: LookupView = { label: "食べる", reading: "たべる", meanings: ["to eat", "to devour"] };
    const onLookup = vi.fn().mockResolvedValue(lookup);
    render(<TextReader text={text} onLookup={onLookup} />);
    fireEvent.click(screen.getByRole("button", { name: /食べる/ }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("to eat; to devour"));
    expect(onLookup).toHaveBeenCalledWith(WORD);
  });

  it("names the episode and level, and credits its sources", () => {
    render(<TextReader text={text} onLookup={vi.fn()} />);
    expect(screen.getByText("Episode 2 · N5")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Tatoeba/ }).getAttribute("href")).toBe("https://tatoeba.org");
  });

  it("shows no episode line for a plain Reading Passage", () => {
    render(<TextReader text={{ ...text, episode: null }} onLookup={vi.fn()} />);
    expect(screen.queryByText(/Episode/)).toBeNull();
  });
});

describe("EpisodeList", () => {
  const lists: EpisodeLists = {
    levels: [
      { level: "N5", episodes: [{ id: "00000000-0000-7000-8000-0000000000b1", episode: 1, title: "朝ごはん", at: "2026-02-01T10:00:00Z" }] },
      { level: "unlevelled", episodes: [{ id: "00000000-0000-7000-8000-0000000000b2", episode: 1, title: "旅", at: "2026-02-01T10:00:00Z" }] },
    ],
  };
  const show = (value: EpisodeLists) =>
    render(
      <MemoryRouter>
        <Routes>
          <Route path="*" element={<EpisodeList lists={value} />} />
        </Routes>
      </MemoryRouter>,
    );

  it("lists episodes under their level, each linking to its text", () => {
    show(lists);
    expect(screen.getByRole("heading", { name: "N5" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Unlevelled" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Episode 1: 朝ごはん/ }).getAttribute("href")).toBe("/reading/texts/00000000-0000-7000-8000-0000000000b1");
  });

  it("says why there are no stories yet and opens Learn, where the first one comes from", () => {
    show({ levels: [] });
    expect(screen.getByText("No stories yet. Finish a Learn batch and your first one arrives.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Learn a batch" }).getAttribute("href")).toBe("/learn");
  });

  it("offers no way to Learn once there are stories", () => {
    show(lists);
    expect(screen.queryByRole("link", { name: "Learn a batch" })).toBeNull();
  });
});
