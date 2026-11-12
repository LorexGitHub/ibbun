// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StudyItemSummary } from "@mojibun/content-graph";
import { StudyItemId } from "@mojibun/shared";
import type { Question } from "../contract.ts";
import type { CramClient } from "./client.ts";
import { askedFor, CramScreen } from "./CramScreen.tsx";
import { createCramClient } from "./client.ts";

afterEach(cleanup);

const ID_A = StudyItemId.parse("00000000-0000-4000-8000-0000000000a1");
const ID_B = StudyItemId.parse("00000000-0000-4000-8000-0000000000a2");
const summary = (id: typeof ID_A, label: string, meaning: string): StudyItemSummary => ({ id, type: "word", level: "N5", label, reading: null, meaning });
const YAMA = summary(ID_A, "山", "mountain");
const KAWA = summary(ID_B, "川", "river");

const question = (studyItemId: string, over: Partial<Question> = {}): Question => ({
  studyItemId,
  exampleId: `example-${studyItemId}`,
  itemType: "word",
  sentence: { before: "", target: "山", after: "に登りました。", mode: "blank" },
  translationEn: "I climbed a mountain.",
  hint: "mountain",
  facets: [
    {
      facet: "japanese",
      label: "The missing Japanese",
      answerData: { facet: "japanese", accepted: [{ id: "a", written: "山", reading: "やま" }], alternates: [{ id: "b", written: "お山", message: "That works, but we want the plain form." }], knownWrong: [] },
    },
  ],
  ...over,
});

const fakeClient = (over: Partial<CramClient> = {}): CramClient => ({
  items: vi.fn(async () => ({ ok: true as const, data: [YAMA, KAWA] })),
  question: vi.fn(async (id: string) => ({ ok: true as const, data: question(id) })),
  submit: vi.fn(async ({ facets }) => ({
    ok: true as const,
    data: { status: "graded" as const, passed: facets[0]!.input === "やま", results: [{ facet: "japanese" as const, outcome: facets[0]!.input === "やま" ? ("pass" as const) : ("fail" as const) }] },
  })),
  ...over,
});

const choose = async (...labels: string[]) => {
  for (const label of labels) fireEvent.click(await screen.findByRole("checkbox", { name: new RegExp(label) }));
  fireEvent.click(screen.getByRole("button", { name: /Practise/ }));
};

const answer = (text: string) => {
  fireEvent.change(screen.getByRole("textbox", { name: "The missing Japanese" }), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Check" }));
};

describe("opened with Study Items in the address", () => {
  afterEach(() => window.history.replaceState({}, "", "/cram"));

  it("starts practising exactly those, in order, without the chooser", async () => {
    window.history.replaceState({}, "", `/cram?items=${ID_B},${ID_A}`);
    const client = fakeClient();
    render(<CramScreen client={client} />);
    expect(await screen.findByText("1 of 2")).toBeTruthy();
    expect(client.question).toHaveBeenCalledWith(ID_B);
    expect(client.items).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Practise/ })).toBeNull();
  });

  it("goes to the chooser afterwards", async () => {
    window.history.replaceState({}, "", `/cram?items=${ID_A}`);
    render(<CramScreen client={fakeClient()} />);
    await screen.findByText("1 of 1");
    answer("やま");
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    fireEvent.click(await screen.findByRole("button", { name: "Choose more" }));
    expect(await screen.findByRole("checkbox", { name: /山/ })).toBeTruthy();
  });

  it("drops what is not a Study Item id, and shows the chooser when nothing is left", async () => {
    expect(askedFor(`?items=nope,${ID_A},`)).toEqual([{ id: ID_A, label: "a Study Item from your Reviews" }]);
    expect(askedFor("")).toEqual([]);
    window.history.replaceState({}, "", "/cram?items=nope");
    render(<CramScreen client={fakeClient()} />);
    expect(await screen.findByRole("checkbox", { name: /山/ })).toBeTruthy();
  });
});

describe("choosing items", () => {
  it("lists the level's items, locked or not, and asks the API for N5 first", async () => {
    const client = fakeClient();
    render(<CramScreen client={client} />);
    expect(await screen.findByRole("checkbox", { name: /山/ })).toBeTruthy();
    expect(client.items).toHaveBeenCalledWith({ level: "N5", type: undefined });
  });

  it("re-lists when the level or type changes", async () => {
    const client = fakeClient();
    render(<CramScreen client={client} />);
    await screen.findByRole("checkbox", { name: /山/ });
    fireEvent.change(screen.getByLabelText("Level"), { target: { value: "N3" } });
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "kanji" } });
    await waitFor(() => expect(client.items).toHaveBeenLastCalledWith({ level: "N3", type: "kanji" }));
  });

  it("searches when there is a search term, and lists the level again when it is cleared", async () => {
    const client = fakeClient();
    render(<CramScreen client={client} />);
    await screen.findByRole("checkbox", { name: /山/ });
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: " mountain " } });
    fireEvent.click(screen.getByRole("button", { name: "Find" }));
    await waitFor(() => expect(client.items).toHaveBeenLastCalledWith({ q: "mountain", type: undefined }));
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: " " } });
    fireEvent.click(screen.getByRole("button", { name: "Find" }));
    await waitFor(() => expect(client.items).toHaveBeenLastCalledWith({ level: "N5", type: undefined }));
  });

  it("keeps the choice across searches, and Practise starts disabled", async () => {
    const client = fakeClient();
    render(<CramScreen client={client} />);
    const start = await screen.findByRole("button", { name: "Practise 0 items" });
    expect((start as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(await screen.findByRole("checkbox", { name: /山/ }));
    expect(screen.getByRole("button", { name: "Practise 1 item" })).toBeTruthy();
    (client.items as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, data: [KAWA] });
    fireEvent.click(screen.getByRole("button", { name: "Find" }));
    await screen.findByRole("checkbox", { name: /川/ });
    expect(screen.getByRole("button", { name: "Practise 1 item" })).toBeTruthy();
  });

  it("chooses everything shown, and clears", async () => {
    render(<CramScreen client={fakeClient()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Choose all shown" }));
    expect(screen.getByRole("button", { name: "Practise 2 items" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByRole("button", { name: "Practise 0 items" })).toBeTruthy();
  });

  it("unchecking removes an item from the choice", async () => {
    render(<CramScreen client={fakeClient()} />);
    const box = await screen.findByRole("checkbox", { name: /山/ });
    fireEvent.click(box);
    fireEvent.click(box);
    expect(screen.getByRole("button", { name: "Practise 0 items" })).toBeTruthy();
  });

  it("shows why the list failed, and says when nothing matched", async () => {
    const failing = fakeClient({ items: async () => ({ ok: false, status: 401, message: "log in first" }) });
    render(<CramScreen client={failing} />);
    expect((await screen.findByRole("alert")).textContent).toBe("log in first");
    cleanup();
    render(<CramScreen client={fakeClient({ items: async () => ({ ok: true, data: [] }) })} />);
    expect(await screen.findByText("Nothing matches. Try another level, type or search word, or look it up in the Library.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open the Library" }).getAttribute("href")).toBe("/browse");
  });
});

describe("practising", () => {
  it("asks each chosen item once, blanking the target, and sums up with Mastery untouched", async () => {
    const client = fakeClient();
    render(<CramScreen client={client} />);
    await choose("山", "川");
    expect(await screen.findByText("1 of 2")).toBeTruthy();
    expect(screen.getByLabelText("blank")).toBeTruthy();
    expect(screen.getByText("I climbed a mountain.")).toBeTruthy();
    answer("やま");
    expect(await screen.findByText("Right.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("2 of 2")).toBeTruthy();
    answer("かわ");
    expect(await screen.findByText("Not quite.")).toBeTruthy();
    expect(screen.getByText(/Answer: 山/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText(/1 of 2 right\. Mastery and statistics are unchanged\./)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Choose more" }));
    expect(await screen.findByRole("heading", { name: "Cram" })).toBeTruthy();
  });

  it("highlights a Kanji's target and asks for both facets", async () => {
    const kanji = question(ID_A, {
      itemType: "kanji",
      sentence: { before: "", target: "山", after: "に登りました。", mode: "highlight" },
      facets: [
        ...question(ID_A).facets,
        { facet: "meaning", label: "Meaning", answerData: { facet: "meaning", meanings: [{ id: "m0", text: "mountain" }], knownWrong: [] } },
      ],
    });
    render(<CramScreen client={fakeClient({ question: async () => ({ ok: true, data: kanji }) })} />);
    await choose("山");
    expect((await screen.findByText("山", { selector: "mark" })).tagName).toBe("MARK");
    expect(screen.getByRole("textbox", { name: "Meaning" })).toBeTruthy();
  });

  it("nudges on an alternate or a non-answer without sending anything, then sends the attempts with the graded try", async () => {
    const client = fakeClient();
    render(<CramScreen client={client} />);
    await choose("山");
    await screen.findByText("1 of 1");
    answer("お山");
    expect(await screen.findByText("That works, but we want the plain form.")).toBeTruthy();
    answer("q");
    expect(await screen.findByText(/Type your answer in Japanese/)).toBeTruthy();
    expect(client.submit).not.toHaveBeenCalled();
    answer("やま");
    await screen.findByText("Right.");
    expect(client.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        studyItemId: ID_A,
        exampleId: `example-${ID_A}`,
        facets: [{ facet: "japanese", input: "やま" }],
        attempts: [
          { facet: "japanese", input: "お山" },
          { facet: "japanese", input: "q" },
        ],
        hintsOpened: [],
        revealed: false,
        timeToAnswerMs: expect.any(Number),
      }),
    );
  });

  it("opens the hint on request and reports it", async () => {
    const client = fakeClient();
    render(<CramScreen client={client} />);
    await choose("山");
    fireEvent.click(await screen.findByRole("button", { name: "Hint" }));
    expect(screen.getByText("Hint: mountain")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Hint" })).toBeNull();
    answer("やま");
    await screen.findByText("Right.");
    expect(client.submit).toHaveBeenCalledWith(expect.objectContaining({ hintsOpened: ["hint"] }));
  });

  it("offers no hint button when the Example has none", async () => {
    render(<CramScreen client={fakeClient({ question: async (id) => ({ ok: true, data: question(id, { hint: null, translationEn: null }) }) })} />);
    await choose("山");
    await screen.findByRole("button", { name: "Check" });
    expect(screen.queryByRole("button", { name: "Hint" })).toBeNull();
  });

  it("Show answer sends a revealed fail and shows the answer", async () => {
    const client = fakeClient();
    render(<CramScreen client={client} />);
    await choose("山");
    fireEvent.click(await screen.findByRole("button", { name: "Show answer" }));
    expect(await screen.findByText("Not quite.")).toBeTruthy();
    expect(client.submit).toHaveBeenCalledWith(expect.objectContaining({ revealed: true }));
    expect(screen.getByText(/Answer: 山/)).toBeTruthy();
  });

  it("shows the server's explanation of a known wrong answer", async () => {
    const client = fakeClient({
      submit: async () => ({ ok: true, data: { status: "graded", passed: false, results: [{ facet: "japanese", outcome: "fail", message: "That is the river." }] } }),
    });
    render(<CramScreen client={client} />);
    await choose("山");
    await screen.findByText("1 of 1");
    answer("かわ");
    expect(await screen.findByText(/That is the river\./)).toBeTruthy();
  });

  it("shows the server's nudge when the API asks for another try", async () => {
    const client = fakeClient({
      submit: async () => ({ ok: true, data: { status: "retry", results: [{ facet: "japanese", outcome: "retry", message: "Try the plain form." }] } }),
    });
    render(<CramScreen client={client} />);
    await choose("山");
    await screen.findByText("1 of 1");
    answer("やま");
    expect(await screen.findByText("Try the plain form.")).toBeTruthy();
  });

  it("keeps the Learner on the question when saving fails", async () => {
    const client = fakeClient({ submit: async () => ({ ok: false, status: 500, message: "try again" }) });
    render(<CramScreen client={client} />);
    await choose("山");
    await screen.findByText("1 of 1");
    answer("やま");
    expect((await screen.findByRole("alert")).textContent).toBe("try again");
    expect(screen.getByRole("button", { name: "Check" })).toBeTruthy();
  });

  it("skips an item with nothing to practise and says so at the end", async () => {
    const client = fakeClient({ question: async (id) => (id === ID_A ? { ok: false, status: 404, message: "nothing" } : { ok: true, data: question(id) }) });
    render(<CramScreen client={client} />);
    await choose("山", "川");
    await screen.findByRole("textbox", { name: "The missing Japanese" });
    answer("やま");
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    expect(await screen.findByText(/1 of 1 right/)).toBeTruthy();
    expect(screen.getByText("No Example to practise yet for 山.")).toBeTruthy();
  });
});

describe("the HTTP client", () => {
  const respond = (body: unknown, status = 200) => vi.fn(async (..._args: unknown[]) => new Response(JSON.stringify(body), { status }));

  it("lists items by the query it is given, leaving out what is empty", async () => {
    const fetcher = respond([YAMA]);
    const result = await createCramClient(fetcher as never).items({ level: "N5", type: undefined });
    expect(result).toEqual({ ok: true, data: [YAMA] });
    expect(fetcher).toHaveBeenCalledWith("/api/cram/items?level=N5", expect.objectContaining({ credentials: "same-origin" }));
  });

  it("asks for the Example after the one just seen", async () => {
    const fetcher = respond(question(ID_A));
    await createCramClient(fetcher as never).question(ID_A, "ex 1");
    expect(fetcher.mock.calls[0]![0]).toBe(`/api/cram/items/${ID_A}/question?after=ex%201`);
    await createCramClient(fetcher as never).question(ID_A);
    expect(fetcher.mock.calls[1]![0]).toBe(`/api/cram/items/${ID_A}/question`);
  });

  it("posts a submission as JSON", async () => {
    const fetcher = respond({ status: "graded", passed: true, results: [] });
    await createCramClient(fetcher as never).submit({ studyItemId: ID_A, exampleId: "e", facets: [{ facet: "japanese", input: "やま" }] });
    const [path, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe("/api/cram/answers");
    expect(init).toMatchObject({ method: "POST", headers: { "content-type": "application/json" } });
    expect(JSON.parse(init.body as string)).toMatchObject({ exampleId: "e" });
  });

  it("reports the API's message on a failure, or the status text when the body is not JSON", async () => {
    expect(await createCramClient(respond({ message: "log in first" }, 401) as never).items({ level: "N5" })).toEqual({ ok: false, status: 401, message: "log in first" });
    const notJson = vi.fn(async () => new Response("oops", { status: 502, statusText: "Bad Gateway" }));
    expect(await createCramClient(notJson as never).items({ level: "N5" })).toEqual({ ok: false, status: 502, message: "Bad Gateway" });
  });
});

describe("Cram by keyboard", () => {
  const key = (k: string, on: Element = document.body) => fireEvent.keyDown(on, { key: k });
  const markOn = (name: string) => screen.getByRole("button", { name }).querySelector("kbd")?.textContent;

  it("puts the cursor in the answer, checks on Enter, moves on with Enter, and chooses more on Enter", async () => {
    const client = fakeClient();
    render(<CramScreen client={client} />);
    await choose("山");
    const field = await screen.findByRole("textbox", { name: "The missing Japanese" });
    expect(document.activeElement).toBe(field);
    expect(markOn("Check")).toBe("↵");
    expect(markOn("Show answer")).toBeUndefined();

    fireEvent.change(field, { target: { value: "やま" } });
    key("Enter", field);
    expect(await screen.findByText("Right.")).toBeTruthy();
    expect(client.submit).toHaveBeenCalledOnce();
    expect(markOn("Next")).toBe("↵");
    key("Enter");

    expect(await screen.findByText(/1 of 1 right/)).toBeTruthy();
    expect(markOn("Choose more")).toBe("↵");
    key("Enter");
    expect(await screen.findByRole("heading", { name: "Cram" })).toBeTruthy();
  });

  it("starts a Kanji in its first field only", async () => {
    const kanji = question(ID_A, {
      itemType: "kanji",
      facets: [
        { facet: "japanese", label: "Reading", answerData: { facet: "japanese", accepted: [{ id: "a", written: "山", reading: "やま" }], alternates: [], knownWrong: [] } },
        { facet: "meaning", label: "Meaning", answerData: { facet: "meaning", meanings: [{ id: "m", text: "mountain" }], knownWrong: [] } },
      ],
    });
    render(<CramScreen client={fakeClient({ question: vi.fn(async () => ({ ok: true as const, data: kanji })) })} />);
    await choose("山");
    const first = await screen.findByRole("textbox", { name: "Reading" });
    expect(document.activeElement).toBe(first);
  });
});
