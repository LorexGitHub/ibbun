// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudyItemId } from "@ibbun/shared";
import type { ReviewPrompt, SubmitResponse } from "../contract.ts";
import { ReviewCard } from "../web/ReviewCard.tsx";
import { flagAnswer, flaggableFacet } from "./FlagButton.tsx";

afterEach(cleanup);

const WORD = StudyItemId.parse("00000000-0000-4000-8000-000000000001");
const prompt: ReviewPrompt = {
  studyItemId: WORD,
  type: "word",
  exampleId: "ex-1",
  mode: "blank",
  sentence: { before: "私は", target: "水", after: "を飲む。" },
  translationEn: null,
  japaneseExplanation: null,
  hint: null,
  facets: [{ facet: "cloze", answerData: { facet: "japanese", accepted: [{ id: "a1", written: "水", reading: "みず" }], alternates: [], knownWrong: [] } }],
};
const WRONG: SubmitResponse = { passed: false, facets: [{ facet: "cloze", outcome: "fail" }] };
const RIGHT: SubmitResponse = { passed: true, facets: [{ facet: "cloze", outcome: "pass" }] };

const mount = (result: SubmitResponse, flag = vi.fn(async () => undefined)) => {
  render(<ReviewCard prompt={prompt} preferences={{ convertRomaji: true, explanations: "english" }} submit={async () => result} flag={flag} onDone={() => undefined} />);
  return flag;
};
const answer = async (button = "Check") => {
  fireEvent.change(screen.getByLabelText("Answer"), { target: { value: "みづ" } });
  fireEvent.click(screen.getByRole("button", { name: button }));
  await screen.findByRole("status");
};

describe("flagging from a Review", () => {
  it("sends the graded facet of the Review just logged, then says the grade stays", async () => {
    const flag = mount(WRONG);
    await answer();
    fireEvent.click(screen.getByRole("button", { name: "My answer was right" }));
    await waitFor(() => expect(screen.getByText(/stays as graded/)).toBeTruthy());
    expect(flag).toHaveBeenCalledWith({ studyItemId: WORD, exampleId: "ex-1", facet: "cloze" });
    expect(screen.queryByRole("button", { name: "My answer was right" })).toBeNull();
  });

  it("lets the Learner try again when sending fails", async () => {
    const flag = mount(WRONG, vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue(undefined));
    await answer();
    fireEvent.click(screen.getByRole("button", { name: "My answer was right" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Could not send");
    fireEvent.click(screen.getByRole("button", { name: "My answer was right" }));
    await waitFor(() => expect(screen.getByText(/stays as graded/)).toBeTruthy());
    expect(flag).toHaveBeenCalledTimes(2);
  });

  it("offers no flag for a right answer or a revealed one", async () => {
    mount(RIGHT);
    await answer();
    expect(screen.queryByRole("button", { name: "My answer was right" })).toBeNull();
    cleanup();
    mount(WRONG);
    await answer("Show answer");
    expect(screen.queryByRole("button", { name: "My answer was right" })).toBeNull();
  });
});

describe("sending a flag", () => {
  it("posts the request to the reviews API and fails when it is refused", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, statusText: "no" });
    vi.stubGlobal("fetch", fetchMock);
    const request = { studyItemId: WORD, exampleId: "ex-1", facet: "cloze" as const };
    await flagAnswer(request);
    expect(fetchMock).toHaveBeenCalledWith("/api/reviews/flag", expect.objectContaining({ method: "POST", body: JSON.stringify(request) }));
    await expect(flagAnswer(request)).rejects.toThrow("no");
    vi.unstubAllGlobals();
  });
});

describe("which facet can be flagged", () => {
  it("is the wrong reading or cloze, never a meaning", () => {
    const kanji = (reading: "pass" | "fail", meaning: "pass" | "fail"): SubmitResponse => ({
      passed: false,
      facets: [{ facet: "reading", outcome: reading }, { facet: "meaning", outcome: meaning }],
    });
    expect(flaggableFacet(kanji("fail", "pass"), false)).toBe("reading");
    expect(flaggableFacet(kanji("pass", "fail"), false)).toBeNull();
    expect(flaggableFacet(kanji("fail", "fail"), true)).toBeNull();
  });
});
