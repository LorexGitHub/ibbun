// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudyItemId } from "@ibbun/shared";
import type { DueResponse, ReviewPrompt, SubmitRequest, SubmitResponse } from "../contract.ts";
import { ReviewsScreen } from "../web/ReviewsScreen.tsx";
import { afterAnswer, type Miss } from "./WrapUp.tsx";

afterEach(cleanup);

const noClips = async () => ({ clips: [] });

const ID = StudyItemId.parse("00000000-0000-4000-8000-000000000001");
const prompt = (exampleId: string, target = "水"): ReviewPrompt => ({
  studyItemId: ID,
  type: "word",
  exampleId,
  mode: "blank",
  sentence: { before: "", target, after: `。${exampleId}` },
  translationEn: null,
  japaneseExplanation: null,
  hint: null,
  facets: [
    {
      facet: "cloze",
      answerData: { facet: "japanese", accepted: [{ id: "a", written: target, reading: null, message: null }], alternates: [], knownWrong: [] },
    },
  ],
});
const preferences = { convertRomaji: false, explanations: "english" as const };
const due = (...reviews: ReviewPrompt[]): DueResponse => ({ preferences, reviews });

const verdict = (passed: boolean): SubmitResponse => ({ passed, facets: [{ facet: "cloze", outcome: passed ? "pass" : "fail" }] });
const answerWith = async (text: string) => {
  fireEvent.change(await screen.findByLabelText("Answer"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Check" }));
};
const next = async () => fireEvent.click(await screen.findByRole("button", { name: "Next" }));

describe("the Wrap-Up queue", () => {
  const miss = (asked: string[]): Miss => ({ studyItemId: ID, asked });

  it("drops a Study Item answered right", () => {
    expect(afterAnswer([miss(["a"]), miss(["z"])], "b", true)).toEqual([miss(["z"])]);
  });

  it("sends a Study Item answered wrong to the back, remembering the Example it was asked through", () => {
    expect(afterAnswer([miss(["a"]), miss(["z"])], "b", false)).toEqual([miss(["z"]), miss(["a", "b"])]);
  });

  it("stays empty when it is empty", () => {
    expect(afterAnswer([], "b", false)).toEqual([]);
  });
});

describe("a review session with a miss", () => {
  const setup = (answers: boolean[]) => {
    const submit = vi.fn(async (_: SubmitRequest) => verdict(answers.shift()!));
    const wrapUp = vi.fn(async (_id: StudyItemId, asked: string[]) => due(prompt(`again-${asked.length}`)));
    const ghosts = vi.fn(async () => due());
    render(<ReviewsScreen clips={noClips} load={async () => due(prompt("first"))} submit={submit} wrapUp={wrapUp} ghosts={ghosts} />);
    return { submit, wrapUp, ghosts };
  };
  const GIVEN_KINDS = (submit: ReturnType<typeof setup>["submit"]) => submit.mock.calls.map(([r]) => r.kind);

  it("asks the miss again through a different Example until it is right, recording each as a Wrap-Up", async () => {
    const { submit, wrapUp } = setup([false, false, true]);
    await answerWith("ちがう");
    await next();
    await screen.findByRole("heading", { name: "Wrap-Up" });
    expect(wrapUp).toHaveBeenLastCalledWith(ID, ["first"]);
    await answerWith("ちがう");
    await next();
    await waitFor(() => expect(wrapUp).toHaveBeenLastCalledWith(ID, ["first", "again-1"]));
    await answerWith("水");
    await next();
    await screen.findByText("Session complete.");
    expect(GIVEN_KINDS(submit)).toEqual(["srs", "wrap-up", "wrap-up"]);
  });

  it("skips Wrap-Up when every answer was right", async () => {
    const { submit, wrapUp } = setup([true]);
    await answerWith("水");
    await next();
    await screen.findByText("Session complete.");
    expect(wrapUp).not.toHaveBeenCalled();
    expect(GIVEN_KINDS(submit)).toEqual(["srs"]);
  });

  it("shows Ghosts after Wrap-Up and records them as Ghosts", async () => {
    const submit = vi.fn(async (_: SubmitRequest) => verdict(true));
    const ghosts = vi.fn(async () => due(prompt("ghost")));
    render(<ReviewsScreen clips={noClips} load={async () => due(prompt("first"))} submit={submit} wrapUp={async () => due()} ghosts={ghosts} />);
    await answerWith("水");
    await next();
    await screen.findByRole("heading", { name: "Ghosts" });
    expect(screen.getByText(/do not change your Mastery/)).toBeTruthy();
    await answerWith("水");
    await next();
    await screen.findByText("Session complete.");
    expect(submit.mock.calls.map(([r]) => [r.kind, r.exampleId])).toEqual([["srs", "first"], ["ghost", "ghost"]]);
  });

  it("goes on to the end when Wrap-Up has nothing to ask for the miss", async () => {
    const submit = vi.fn(async (_: SubmitRequest) => verdict(false));
    render(<ReviewsScreen clips={noClips} load={async () => due(prompt("first"))} submit={submit} wrapUp={async () => due()} ghosts={async () => due()} />);
    await answerWith("ちがう");
    await next();
    await screen.findByText("Session complete.");
  });

  it("says so when the re-ask cannot be loaded", async () => {
    render(<ReviewsScreen clips={noClips} load={async () => due(prompt("first"))} submit={async () => verdict(false)} wrapUp={async () => Promise.reject(new Error("offline"))} ghosts={async () => due()} />);
    await answerWith("ちがう");
    await next();
    expect((await screen.findByRole("alert")).textContent).toBe("offline");
  });
});

describe("a review session with nothing due", () => {
  it("still offers Ghosts", async () => {
    const submit = vi.fn(async (_: SubmitRequest) => verdict(true));
    render(<ReviewsScreen clips={noClips} load={async () => due()} submit={submit} ghosts={async () => due(prompt("ghost"))} />);
    await screen.findByRole("heading", { name: "Ghosts" });
    expect(screen.queryByText(/No Reviews are due/)).toBeNull();
    await answerWith("水");
    await next();
    await screen.findByText("No Reviews are due.");
    expect(submit.mock.calls[0]![0].kind).toBe("ghost");
  });

  it("shows no Ghosts section when there are none, or when they cannot be loaded", async () => {
    render(<ReviewsScreen clips={noClips} load={async () => due()} ghosts={async () => Promise.reject(new Error("offline"))} />);
    await screen.findByText("No Reviews are due.");
    expect(screen.queryByRole("heading", { name: "Ghosts" })).toBeNull();
  });
});
