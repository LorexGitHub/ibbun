// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StudyItemId } from "@mojibun/shared";
import type { DueResponse, ReviewPrompt, SubmitResponse } from "../contract.ts";
import { clearUntil, doorsAfter, tallied } from "./ending.ts";
import { ReviewsScreen } from "./ReviewsScreen.tsx";

afterEach(cleanup);

const ID_A = StudyItemId.parse("00000000-0000-4000-8000-000000000001");
const ID_B = StudyItemId.parse("00000000-0000-4000-8000-000000000002");

describe("the line of fact when nothing is due", () => {
  const now = new Date(2026, 10, 12, 9, 5);

  it("gives the time of the next Review when it is today", () => {
    expect(clearUntil(new Date(2026, 10, 12, 16, 40).toISOString(), now)).toBe("Clear until 16:40");
    expect(clearUntil(new Date(2026, 10, 12, 9, 6).toISOString(), now)).toBe("Clear until 09:06");
  });

  it("adds the day when the next Review is on another day", () => {
    expect(clearUntil(new Date(2026, 10, 13, 7, 0).toISOString(), now)).toBe("Clear until Nov 13, 07:00");
  });

  it("says nothing when no Review is scheduled", () => {
    expect(clearUntil(null, now)).toBeNull();
    expect(clearUntil(undefined, now)).toBeNull();
  });
});

describe("the count of a session", () => {
  it("adds every answer and the right ones", () => {
    const one = tallied({ done: 0, right: 0 }, true);
    expect(one).toEqual({ done: 1, right: 1 });
    expect(tallied(one, false)).toEqual({ done: 2, right: 1 });
  });
});

describe("the doors at the end", () => {
  const hrefs = (lapses: string[]) => doorsAfter(lapses).map((d) => d.href);

  it("offers Learn, Reading and Listening when nothing was missed", () => {
    expect(hrefs([])).toEqual(["/learn", "/reading", "/listening"]);
    expect(doorsAfter([]).map((d) => d.label)).toEqual(["Learn", "Reading", "Listening"]);
  });

  it("puts Cram with the session's Lapses first after a miss", () => {
    expect(hrefs([ID_A, ID_B])).toEqual([`/cram?items=${ID_A},${ID_B}`, "/learn", "/reading"]);
    expect(doorsAfter([ID_A, ID_B])[0]).toMatchObject({ label: "Cram the Lapses", note: "2 from this session" });
  });
});

describe("the end of the reviews screen", () => {
  const prompt = (studyItemId: StudyItemId, exampleId: string): ReviewPrompt => ({
    studyItemId,
    type: "word",
    exampleId,
    mode: "blank",
    sentence: { before: "", target: "水", after: "。" },
    translationEn: null,
    japaneseExplanation: null,
    hint: null,
    facets: [{ facet: "cloze", answerData: { facet: "japanese", accepted: [{ id: "a", written: "水", reading: null, message: null }], alternates: [], knownWrong: [] } }],
  });
  const preferences = { convertRomaji: false, explanations: "english" as const };
  const due = (reviews: ReviewPrompt[], nextDue?: string | null): DueResponse => ({ preferences, reviews, nextDue });
  const verdict = (passed: boolean): SubmitResponse => ({ passed, facets: [{ facet: "cloze", outcome: passed ? "pass" : "fail" }] });
  const none = async () => due([]);
  const noClips = async () => ({ clips: [] });
  const doors = () => [...screen.getByRole("navigation", { name: "Where next" }).querySelectorAll("a")].map((a) => [a.textContent, a.getAttribute("href")]);
  const answer = async (text: string) => {
    fireEvent.change(await screen.findByLabelText("Answer"), { target: { value: text } });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
  };

  it("says until when it is clear and offers three doors, never Come back later", async () => {
    const later = new Date(Date.now() + 60_000);
    render(<ReviewsScreen load={async () => due([], later.toISOString())} ghosts={none} clips={noClips} />);
    expect(await screen.findByRole("heading", { name: "No Reviews are due." })).toBeTruthy();
    expect(screen.getByText(clearUntil(later.toISOString(), new Date())!)).toBeTruthy();
    expect(doors().map(([, href]) => href)).toEqual(["/learn", "/reading", "/listening"]);
    expect(screen.queryByText(/come back later/i)).toBeNull();
    expect(screen.queryByText(/done,/)).toBeNull();
  });

  it("shows no time when no Review is scheduled", async () => {
    render(<ReviewsScreen load={none} ghosts={none} clips={noClips} />);
    await screen.findByRole("heading", { name: "No Reviews are due." });
    expect(screen.queryByText(/Clear until/)).toBeNull();
  });

  it("counts the session and opens Cram on the Lapses after a miss", async () => {
    const answers = [true, false];
    render(
      <ReviewsScreen
        load={async () => due([prompt(ID_A, "a"), prompt(ID_B, "b")])}
        submit={async () => verdict(answers.shift()!)}
        wrapUp={none}
        ghosts={none}
        clips={noClips}
      />,
    );
    await answer("水");
    await screen.findByText("2 of 2");
    await answer("ちがう");
    expect(await screen.findByRole("heading", { name: "Session complete." })).toBeTruthy();
    expect(screen.getByText("2 done, 1 right").className).toBe("ending-fact");
    expect(doors()).toEqual([
      ["Cram the Lapses1 from this session", `/cram?items=${ID_B}`],
      ["LearnNew Study Items", "/learn"],
      ["ReadingStories from what you know", "/reading"],
    ]);
  });

  it("offers Learn, Reading and Listening after a session with no miss", async () => {
    render(<ReviewsScreen load={async () => due([prompt(ID_A, "a")])} submit={async () => verdict(true)} wrapUp={none} ghosts={none} clips={noClips} />);
    await answer("水");
    await screen.findByText("1 done, 1 right");
    expect(doors().map(([, href]) => href)).toEqual(["/learn", "/reading", "/listening"]);
  });
});
