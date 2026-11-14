import { useCallback, useEffect, useState } from "react";
import { Button, Card, Pill, State } from "@ibbun/ui";
import { SpotChecksRoute } from "./sampling/spot-checks.tsx";

export type Lane = "supervisor" | "reviewer";
export type QueueItem = {
  id: string;
  reason: string;
  lane: Lane;
  recordId: string | null;
  generationRunId: string | null;
  generationRequestId: string | null;
  detail: unknown;
  at: string;
};
export type Filter = { reason: string; lane: string };

const LANE_NOTE: Record<Lane, string> = {
  supervisor: "operational: goes straight to the supervisor",
  reviewer: "content: the reviewer agent decides, the supervisor samples",
};

/** The Content Approval queue: entries with their reasons, filters and a resolve button each. */
export const QueueScreen = ({
  items,
  reasons,
  filter,
  onFilter,
  onResolve,
  error,
}: {
  items: QueueItem[];
  reasons: string[];
  filter: Filter;
  onFilter: (next: Filter) => void;
  onResolve: (id: string) => void;
  error?: string;
}) => (
  <section aria-label="Content Approval queue">
    <h1>Content Approval queue</h1>
    <p>
      <a href="/admin/content-approval/spot-checks">Spot-checks</a>
    </p>
    <div className="row">
      <label>
        Reason{" "}
        <select value={filter.reason} onChange={(e) => onFilter({ ...filter, reason: e.target.value })}>
          <option value="">all</option>
          {reasons.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </label>
      <label>
        Lane{" "}
        <select value={filter.lane} onChange={(e) => onFilter({ ...filter, lane: e.target.value })}>
          <option value="">all</option>
          <option value="supervisor">supervisor</option>
          <option value="reviewer">reviewer</option>
        </select>
      </label>
    </div>
    {error && <p role="alert">{error}</p>}
    {!error && items.length === 0 && <State inline heading={2} title="Nothing is waiting." note="Escalated reviews and failed generation land here." />}
    <ul>
      {items.map((item) => (
        <li key={item.id}>
          <Card>
            <Pill ink={item.lane === "supervisor"}>{item.reason}</Pill> <small>{LANE_NOTE[item.lane]}</small>
            <p>
              {item.recordId && <>Record {item.recordId}. </>}
              {item.generationRequestId && <>Generation Request {item.generationRequestId}. </>}
              {new Date(item.at).toLocaleString()}
            </p>
            {item.detail != null && <pre>{JSON.stringify(item.detail, null, 2)}</pre>}
            <Button onClick={() => onResolve(item.id)}>Resolve</Button>
          </Card>
        </li>
      ))}
    </ul>
  </section>
);

type Loaded = { items: QueueItem[]; reasons: string[]; error?: string };

/** Fetches the queue under the filter. */
export const loadQueue = async (filter: Filter, send: typeof fetch = fetch): Promise<Loaded> => {
  const query = new URLSearchParams(Object.entries(filter).filter(([, v]) => v));
  const response = await send(`/api/content-approval/queue?${query}`, { credentials: "same-origin" });
  if (!response.ok) return { items: [], reasons: [], error: response.status === 403 ? "Supervisors only." : "Could not load the queue." };
  const body = (await response.json()) as { reasons: string[]; entries: QueueItem[] };
  return { items: body.entries, reasons: body.reasons };
};

export const resolveEntry = (id: string, send: typeof fetch = fetch) =>
  send(`/api/content-approval/queue/${id}/resolve`, { method: "POST", credentials: "same-origin" });

const QueueRoute = () => {
  const [filter, setFilter] = useState<Filter>({ reason: "", lane: "" });
  const [loaded, setLoaded] = useState<Loaded>({ items: [], reasons: [] });
  const refresh = useCallback(() => loadQueue(filter).then(setLoaded), [filter]);
  useEffect(() => void refresh(), [refresh]);
  const resolve = async (id: string) => {
    await resolveEntry(id);
    await refresh();
  };
  return <QueueScreen {...loaded} filter={filter} onFilter={setFilter} onResolve={resolve} />;
};

export const routes = [
  { path: "/admin/content-approval", component: QueueRoute },
  { path: "/admin/content-approval/spot-checks", component: SpotChecksRoute },
];
