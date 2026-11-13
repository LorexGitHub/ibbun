import { useEffect, useState } from "react";
import { Card } from "@ibbun/ui";
import { CreditsResponse, type CreditEntry } from "../contract.ts";
import { LEVEL_CREDITS, LEVEL_NOTE, UNIDIC_NOTICE } from "./notices.ts";

const live = ({ version, appliedAt }: CreditEntry) =>
  version === null && appliedAt === null ? "not imported yet" : [version, appliedAt?.slice(0, 10)].filter(Boolean).join(" · ");

export const CreditsView = ({ credits }: { credits: readonly CreditEntry[] }) => (
  <article className="credits">
    <h1>Credits</h1>
    <p>ibbun is built on open data. Each source below keeps its own licence; the version and date are the ones live in the app today.</p>
    <Card>
      <table>
        <thead>
          <tr><th>Source</th><th>Licence</th><th>Live version</th></tr>
        </thead>
        <tbody>
          {credits.map((c) => (
            <tr key={c.name}>
              <td><a href={c.url}>{c.name}</a></td>
              <td>{c.licenceName}</td>
              <td>{live(c)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
    <section aria-labelledby="levels-heading">
      <h2 id="levels-heading">JLPT levels are estimates</h2>
      <p>{LEVEL_NOTE}</p>
      <ul>
        {LEVEL_CREDITS.map((c) => (
          <li key={c.name}><a href={c.href}>{c.name}</a>, {c.role}</li>
        ))}
      </ul>
    </section>
    <section aria-labelledby="unidic-heading">
      <h2 id="unidic-heading">{UNIDIC_NOTICE.heading}</h2>
      <p>{UNIDIC_NOTICE.lead}</p>
      {UNIDIC_NOTICE.licence.map((line) => (
        <p key={line} className="attribution">{line}</p>
      ))}
    </section>
  </article>
);

export type Loaded = CreditEntry[] | "failed" | null;

/** What the page shows for each stage of loading. */
export const CreditsState = ({ credits }: { credits: Loaded }) => {
  if (credits === null) return <p>Loading credits…</p>;
  if (credits === "failed") return <p role="alert">The credits could not be loaded. Try again in a moment.</p>;
  return <CreditsView credits={credits} />;
};

export const loadCredits = async (get: typeof fetch = fetch): Promise<CreditEntry[] | "failed"> => {
  try {
    const res = await get("/api/credits");
    return res.ok ? CreditsResponse.parse(await res.json()).credits : "failed";
  } catch {
    return "failed";
  }
};

/** The public Credits page: fetches `/api/credits` and shows it. */
export const CreditsPage = () => {
  const [credits, setCredits] = useState<Loaded>(null);
  useEffect(() => void loadCredits().then(setCredits), []);
  return <CreditsState credits={credits} />;
};
