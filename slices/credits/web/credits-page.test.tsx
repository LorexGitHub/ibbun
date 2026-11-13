import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CreditEntry } from "../contract.ts";
import { CreditsState, CreditsView, loadCredits } from "./credits-page.tsx";

const jmdict: CreditEntry = { name: "JMdict", licenceName: "EDRDG Licence (CC BY-SA 4.0)", url: "https://www.edrdg.org/jmdict", version: "2026-11-02", appliedAt: "2026-11-02T00:00:00.000Z" };
const voice: CreditEntry = { name: "VOICEVOX:四国めたん", licenceName: "VOICEVOX voice terms", url: "https://voicevox.hiroshiba.jp/", version: null, appliedAt: null };
const html = renderToString(<CreditsView credits={[jmdict, voice]} />);

describe("Credits page", () => {
  it("links each source and shows its licence, live version and date", () => {
    expect(html).toContain('<a href="https://www.edrdg.org/jmdict">JMdict</a>');
    expect(html).toContain("EDRDG Licence (CC BY-SA 4.0)");
    expect(html).toContain("2026-11-02 · 2026-11-02");
  });

  it("names a source with no import yet, and lists each VOICEVOX character", () => {
    expect(html).toContain("VOICEVOX:四国めたん");
    expect(html).toContain("not imported yet");
  });

  it("shows the date alone for a source applied with no version", () => {
    const undated = renderToString(<CreditsView credits={[{ ...jmdict, version: null }]} />);
    expect(undated).toContain("<td>2026-11-02</td>");
    expect(undated).not.toContain("not imported yet");
  });

  it("says levels are estimates and credits Waller and stephenmk with links", () => {
    expect(html).toContain("estimate");
    expect(html).toContain('<a href="http://www.tanos.co.uk/jlpt/">Jonathan Waller</a>');
    expect(html).toContain('<a href="https://github.com/stephenmk/yomitan-jlpt-vocab">stephenmk</a>');
  });

  it("carries the UniDic BSD notice", () => {
    expect(html).toContain("National Institute for Japanese Language and Linguistics");
    expect(html).toContain("Neither the name of the copyright holder");
  });
});

const reply = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("loading the Credits page", () => {
  it("shows a loading line, then the credits, or an alert when they failed", () => {
    const retry = () => undefined;
    expect(renderToString(<CreditsState credits={null} onRetry={retry} />)).toContain("Loading credits");
    expect(renderToString(<CreditsState credits="failed" onRetry={retry} />)).toContain("The credits did not load");
    expect(renderToString(<CreditsState credits={[jmdict]} onRetry={retry} />)).toContain("JMdict");
  });

  it("parses a good response", async () => {
    expect(await loadCredits(reply({ credits: [jmdict] }))).toEqual([jmdict]);
  });

  it("fails on an error status, a malformed body and a network error", async () => {
    expect(await loadCredits(reply({}, 500))).toBe("failed");
    expect(await loadCredits(reply({ credits: [{ name: 1 }] }))).toBe("failed");
    expect(await loadCredits((async () => Promise.reject(new Error("offline"))) as typeof fetch)).toBe("failed");
  });
});
