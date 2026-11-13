import { useEffect, useState } from "react";
import { Card, Pill } from "@ibbun/ui";
import { RunsResponse, type RunReport } from "../contract.ts";

const COUNT_LABELS: [string, string][] = [
  ["added", "added"],
  ["changed", "changed"],
  ["retired", "retired"],
  ["superseded", "superseded"],
  ["staleOverrides", "overrides stale"],
  ["orphanedOverrides", "overrides orphaned"],
  ["examplesRedrafted", "Examples back to Draft"],
  ["suspended", "Study Items suspended"],
];

const held = (run: RunReport) => run.status === "breaker tripped";

/** One Import Run: what it added, changed and retired, what it flagged, and the way into the queue. */
export const RunCard = ({ run }: { run: RunReport }) => (
  <Card className="import-run">
    <h2>
      {run.dataset} {run.upstreamVersion} <Pill ink={held(run)}>{held(run) ? "held by the circuit breaker" : run.status}</Pill>
    </h2>
    <p>{run.appliedAt ? `Live since ${run.appliedAt.slice(0, 10)}` : "Not applied"}</p>
    <dl>
      {COUNT_LABELS.map(([key, label]) => (
        <div key={key}>
          <dt>{label}</dt>
          <dd>{run.counts[key] ?? 0}</dd>
        </div>
      ))}
    </dl>
    {run.diff && (
      <p>
        Against the previous snapshot: {run.diff.added} keys added, {run.diff.changed} changed, {run.diff.gone} gone.
      </p>
    )}
    <a href={run.queuePath}>Open in the Content Approval queue</a>
  </Card>
);

export const RunList = ({ runs }: { runs: RunReport[] }) =>
  runs.length ? <>{runs.map((run) => <RunCard key={run.id} run={run} />)}</> : <p>No Import Run yet. The first one starts on its schedule.</p>;

type State = { kind: "loading" } | { kind: "failed"; message: string } | { kind: "ready"; runs: RunReport[] };

/** The Import Run report screen, for the supervisor. */
export const ReportScreen = () => {
  const [state, setState] = useState<State>({ kind: "loading" });
  useEffect(() => {
    fetch("/api/import/runs")
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 401 ? "Log in as the supervisor to see Import Runs." : "Import Runs are for the supervisor.");
        setState({ kind: "ready", runs: RunsResponse.parse(await response.json()).runs });
      })
      .catch((error: Error) => setState({ kind: "failed", message: error.message }));
  }, []);
  return (
    <section>
      <h1>Import Runs</h1>
      {state.kind === "loading" && <p>Loading…</p>}
      {state.kind === "failed" && <p role="alert">{state.message}</p>}
      {state.kind === "ready" && <RunList runs={state.runs} />}
    </section>
  );
};
