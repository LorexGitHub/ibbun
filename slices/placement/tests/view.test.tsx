import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PlacementItem } from "../contract.ts";
import { PlacementView, type PlacementViewProps } from "../web/PlacementView.tsx";

const item = (over: Partial<PlacementItem>): PlacementItem => ({
  id: "00000058-0000-7000-8000-000000000001" as PlacementItem["id"],
  type: "kanji",
  label: "日",
  reading: "ニチ",
  meaning: "day",
  known: false,
  ...over,
});

const render = (over: Partial<PlacementViewProps> = {}) =>
  renderToString(
    <PlacementView level="N5" list={{ level: "N5", items: [item({})] }} ticked={new Set()} message={null} onLevel={() => {}} onToggle={() => {}} onSubmit={() => {}} {...over} />,
  );

describe("PlacementView", () => {
  it("shows the five levels with the current one pressed", () => {
    const html = render();
    for (const level of ["N5", "N4", "N3", "N2", "N1"]) expect(html).toContain(`>${level}</button>`);
    expect(html).toMatch(/aria-pressed="true"[^>]*>N5</);
  });

  it("leaves the levels to the header when the Level filter picks the level", () => {
    expect(render({ onLevel: undefined })).not.toContain(">N4</button>");
  });

  it("groups the level's items under Kanji, Words and Grammar, skipping empty groups", () => {
    const html = render({
      list: { level: "N5", items: [item({}), item({ id: "00000058-0000-7000-8000-000000000002" as PlacementItem["id"], type: "word", label: "日本" })] },
    });
    expect(html).toContain("<legend>Kanji</legend>");
    expect(html).toContain("<legend>Words</legend>");
    expect(html).not.toContain("Grammar</legend>");
  });

  it("shows a Known item ticked and locked", () => {
    const html = render({ list: { level: "N5", items: [item({ known: true })] } });
    expect(html).toContain('<input type="checkbox" disabled="" checked=""/>');
    expect(html).toContain("Known");
  });

  it("offers the submit button only once something is ticked", () => {
    expect(render()).toMatch(/<button[^>]*disabled=""[^>]*>Mark <!-- -->0/);
    expect(render({ ticked: new Set(["a"]) })).not.toMatch(/<button[^>]*disabled=""[^>]*>Mark/);
  });

  it("says it is loading until the list arrives", () => {
    expect(render({ list: null }).replaceAll("<!-- -->", "")).toContain("Loading N5");
  });
});
