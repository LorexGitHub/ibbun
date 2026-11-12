// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EpisodeLists, LookupView, TextView } from "../contract.ts";
import { EpisodeList, newestFirst } from "../web/EpisodeList.tsx";
import { TextReader, wordsOf } from "../web/TextReader.tsx";

afterEach(cleanup);

const WORD = "00000000-0000-7000-8000-00000000000a";
const OTHER = "00000000-0000-7000-8000-00000000000b";
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
    {
      id: "00000000-0000-7000-8000-000000000003",
      translation: null,
      runs: [
        { text: "見る", reading: null, wordId: OTHER as never, inBatch: false },
        { text: "食べる", reading: "たべる", wordId: WORD as never, inBatch: true },
      ],
    },
  ],
};

const lookup: LookupView = { label: "食べる", reading: "たべる", meanings: ["to eat", "to devour"] };
const read = (value: TextView = text, onLookup = vi.fn().mockResolvedValue(lookup)) => ({ onLookup, ...render(<TextReader text={value} onLookup={onLookup} />) });
const flip = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const pressed = (name: string) => screen.getByRole("button", { name }).getAttribute("aria-pressed");
const wordList = () => screen.queryByRole("complementary", { name: "Words" });

describe("TextReader", () => {
  it("opens with furigana on, the translation off and the word list hidden", () => {
    const { container } = read();
    expect(within(screen.getByRole("group", { name: "Reader" })).getAllByRole("button").map((b) => b.textContent)).toEqual(["Furigana", "Translation", "Words"]);
    expect([pressed("Furigana"), pressed("Translation"), pressed("Words")]).toEqual(["true", "false", "false"]);
    expect(wordList()).toBeNull();
    expect(container.querySelector(".reader")!.getAttribute("data-words")).toBe("false");
  });

  it("draws furigana only where the server sent a reading, and none once the switch is off", () => {
    const { container } = read();
    expect([...container.querySelectorAll("rt")].map((rt) => rt.textContent)).toEqual(["たべる", "たべる"]);
    flip("Furigana");
    expect(container.querySelectorAll("rt")).toHaveLength(0);
    expect(pressed("Furigana")).toBe("false");
    flip("Furigana");
    expect(container.querySelectorAll("rt")).toHaveLength(2);
  });

  it("shows every translation there is while the Translation switch is on", () => {
    const { container } = read();
    expect(screen.queryByText("I eat bread.")).toBeNull();
    flip("Translation");
    expect(screen.getByText("I eat bread.")).toBeTruthy();
    expect(container.querySelectorAll("em")).toHaveLength(1);
    flip("Translation");
    expect(screen.queryByText("I eat bread.")).toBeNull();
  });

  it("marks the batch's Words in the text, and makes no button of a run that is no Word", () => {
    read();
    const [eat] = screen.getAllByRole("button", { name: /食べる/ });
    expect(eat!.getAttribute("data-in-batch")).toBe("true");
    expect(eat!.className).toBe("word word-batch");
    expect(screen.getByRole("button", { name: "見る" }).className).toBe("word");
    expect(screen.queryByRole("button", { name: /パン/ })).toBeNull();
  });

  it("looks a Word up when tapped and shows what it means", async () => {
    const { onLookup } = read();
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: /食べる/ })[0]!);
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("食べる たべるto eat; to devour"));
    expect(onLookup).toHaveBeenCalledWith(WORD);
  });

  it("leaves a lookup's reading out when it has none", async () => {
    read(text, vi.fn().mockResolvedValue({ ...lookup, reading: null }));
    fireEvent.click(screen.getByRole("button", { name: "見る" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("食べるto eat; to devour"));
  });

  it("names the episode and level, and credits its sources", () => {
    read();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("朝ごはん");
    expect(screen.getByText("Episode 2 · N5")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Tatoeba/ }).getAttribute("href")).toBe("https://tatoeba.org");
  });

  it("names an Unlevelled episode's level in words", () => {
    read({ ...text, episode: { level: "unlevelled", number: 1 } });
    expect(screen.getByText("Episode 1 · Unlevelled")).toBeTruthy();
  });

  it("shows no episode line for a plain Reading Passage", () => {
    read({ ...text, episode: null });
    expect(screen.queryByText(/Episode/)).toBeNull();
  });
});

describe("the reader's word list", () => {
  it("lists each Word once in reading order, never a run that is no Word", () => {
    expect(wordsOf(text).map((w) => [w.text, w.wordId])).toEqual([
      ["食べる", WORD],
      ["見る", OTHER],
    ]);
  });

  it("comes in beside the text when Words is pressed, and goes when it is pressed again", () => {
    const { container } = read();
    flip("Words");
    expect(pressed("Words")).toBe("true");
    expect(container.querySelector(".reader")!.getAttribute("data-words")).toBe("true");
    const items = within(wordList()!).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(["食べる(たべる)New", "見る"]);
    flip("Words");
    expect(wordList()).toBeNull();
  });

  it("follows the Furigana switch", () => {
    read();
    flip("Words");
    flip("Furigana");
    expect(within(wordList()!).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["食べるNew", "見る"]);
  });

  it("looks up a Word pressed in the list", async () => {
    const { onLookup } = read();
    flip("Words");
    fireEvent.click(within(wordList()!).getByRole("button", { name: "見る" }));
    await screen.findByRole("status");
    expect(onLookup).toHaveBeenCalledWith(OTHER);
  });

  it("says so when the text has no Words", () => {
    read({ ...text, sentences: [{ id: "00000000-0000-7000-8000-000000000004", translation: null, runs: [{ text: "パン", reading: null, wordId: null, inBatch: false }] }] });
    flip("Words");
    expect(within(wordList()!).getByText("This text has no Words to look up.")).toBeTruthy();
    expect(within(wordList()!).queryAllByRole("listitem")).toEqual([]);
  });

  it("says nothing of the kind when there are Words", () => {
    read();
    flip("Words");
    expect(screen.queryByText("This text has no Words to look up.")).toBeNull();
  });
});

describe("EpisodeList", () => {
  const B1 = "00000000-0000-7000-8000-0000000000b1";
  const B2 = "00000000-0000-7000-8000-0000000000b2";
  const B3 = "00000000-0000-7000-8000-0000000000b3";
  const lists: EpisodeLists = {
    levels: [
      {
        level: "N5",
        episodes: [
          { id: B1, episode: 1, title: "朝ごはん", at: "2026-02-01T10:00:00Z" },
          { id: B3, episode: 2, title: "学校", at: "2026-02-03T10:00:00Z" },
        ],
      },
      { level: "unlevelled", episodes: [{ id: B2, episode: 1, title: "旅", at: "2026-02-02T10:00:00Z" }] },
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

  it("puts every level's stories in one line, the newest first", () => {
    expect(newestFirst(lists).map((s) => [s.id, s.level])).toEqual([
      [B3, "N5"],
      [B2, "unlevelled"],
      [B1, "N5"],
    ]);
  });

  it("leads with the newest story and a Read button that opens it", () => {
    show(lists);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Reading");
    expect(screen.getByText("Your newest story")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "学校" })).toBeTruthy();
    expect(screen.getByText("Episode 2 · N5")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Read" }).getAttribute("href")).toBe(`/reading/texts/${B3}`);
  });

  it("lists the earlier stories plainly below it, newest first, each linking to its text", () => {
    show(lists);
    const earlier = within(screen.getByRole("region", { name: "Earlier stories" })).getAllByRole("listitem");
    expect(earlier.map((li) => li.textContent)).toEqual(["旅Episode 1 · Unlevelled", "朝ごはんEpisode 1 · N5"]);
    expect(within(earlier[0]!).getByRole("link").getAttribute("href")).toBe(`/reading/texts/${B2}`);
  });

  it("makes Read the big primary button", () => {
    show(lists);
    expect(screen.getByRole("link", { name: "Read" }).className).toBe("btn btn--primary btn--big");
  });

  it("lists a single earlier story", () => {
    show({ levels: [lists.levels[0]!] });
    expect(within(screen.getByRole("region", { name: "Earlier stories" })).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["朝ごはんEpisode 1 · N5"]);
  });

  it("has no earlier stories to list when there is only one", () => {
    show({ levels: [lists.levels[1]!] });
    expect(screen.getByRole("link", { name: "Read" }).getAttribute("href")).toBe(`/reading/texts/${B2}`);
    expect(screen.queryByRole("heading", { name: "Earlier stories" })).toBeNull();
  });

  it("links to the Practice Texts, with stories or without", () => {
    show(lists);
    expect(screen.getByRole("link", { name: "Practice Texts" }).getAttribute("href")).toBe("/reading/practice");
    cleanup();
    show({ levels: [] });
    expect(screen.getByRole("link", { name: "Practice Texts" }).getAttribute("href")).toBe("/reading/practice");
  });

  it("says why there are no stories yet and opens Learn, where the first one comes from", () => {
    show({ levels: [] });
    expect(screen.getByText("No stories yet. Finish a Learn batch and your first one arrives.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Learn a batch" }).getAttribute("href")).toBe("/learn");
    expect(screen.queryByText("Your newest story")).toBeNull();
  });

  it("offers no way to Learn once there are stories", () => {
    show(lists);
    expect(screen.queryByRole("link", { name: "Learn a batch" })).toBeNull();
    expect(screen.queryByText(/No stories yet/)).toBeNull();
  });
});
