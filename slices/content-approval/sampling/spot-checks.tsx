import { useCallback, useEffect, useState } from "react";
import { Button, Card, Pill } from "@ibbun/ui";

export type KindReport = { kind: string; paused: boolean; calibrationLeft: number; sampled: number; errorRate: number };
export type SampleItem = {
  id: string;
  kind: string;
  reason: string;
  record: { table: string; id: string };
  model: string | null;
  rubricVersion: string | null;
  at: string;
  text: string;
  translation?: string;
  audioKey?: string;
};
export type ReReviewFilter = { generationRunId?: string; rubricVersion?: string; model?: string };

const REASON_NOTE: Record<string, string> = {
  calibration: "calibration: every approval after a version change",
  random: "random sample of the reviewer's approvals",
  held: "held: this kind is paused, so the draft is not live until you approve it",
  "re-review": "queued by you for re-review",
};

const KIND_LABEL: Record<string, string> = { example: "Examples", "japanese-explanation": "Japanese Explanations", "grammar-fields": "Grammar Point fields", "listening-clip": "Listening Clips" };

const percent = (rate: number) => `${Math.round(rate * 100)}%`;

const KindRow = ({ report, window, onResume }: { report: KindReport; window: number; onResume: (kind: string) => void }) => (
  <li>
    <Card>
      <strong>{KIND_LABEL[report.kind] ?? report.kind}</strong> <Pill ink={report.paused}>{report.paused ? "auto-approval paused" : "auto-approving"}</Pill>
      <p>
        Error rate {percent(report.errorRate)} of the last {report.sampled} sampled (up to {window}).
        {report.calibrationLeft > 0 && <> Calibrating: the next {report.calibrationLeft} approvals are all sampled.</>}
      </p>
      {report.paused && <Button onClick={() => onResume(report.kind)}>Resume {KIND_LABEL[report.kind] ?? report.kind}</Button>}
    </Card>
  </li>
);

const listenNote = (audioKey?: string) => `Listen to this clip${audioKey ? ` (audio ${audioKey})` : ""} before you decide.`;

const reviewerNote = (sample: SampleItem) => (sample.model ? `${sample.model}, rubric ${sample.rubricVersion}. ` : "");

const SampleBody = ({ sample }: { sample: SampleItem }) => (
  <>
    <Pill ink={sample.reason === "held"}>{sample.reason}</Pill> <small>{KIND_LABEL[sample.kind] ?? sample.kind}. {REASON_NOTE[sample.reason]}</small>
    <p lang="ja">{sample.text}</p>
    {sample.translation && <p>{sample.translation}</p>}
    {sample.kind === "listening-clip" && <p>{listenNote(sample.audioKey)}</p>}
    <p>
      <small>
        {reviewerNote(sample)}Record {sample.record.id}. {new Date(sample.at).toLocaleString()}
      </small>
    </p>
  </>
);

const SampleCard = ({ sample, onVerdict }: { sample: SampleItem; onVerdict: (id: string, verdict: "confirm" | "reject", note: string) => void }) => {
  const [note, setNote] = useState("");
  return (
    <li>
      <Card>
        <SampleBody sample={sample} />
        <label>
          Note <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>{" "}
        <Button onClick={() => onVerdict(sample.id, "confirm", note)}>{sample.reason === "held" ? "Approve" : "Looks right"}</Button>{" "}
        <Button onClick={() => onVerdict(sample.id, "reject", note)}>Reject</Button>
      </Card>
    </li>
  );
};

const FILTERS = { generationRunId: "Generation Run", rubricVersion: "Rubric version", model: "Model" } as const;

const ReReviewForm = ({ onQueue, queued }: { onQueue: (filter: ReReviewFilter) => void; queued: number | null }) => {
  const [by, setBy] = useState<keyof typeof FILTERS>("generationRunId");
  const [value, setValue] = useState("");
  return (
    <section aria-label="Re-review">
      <h2>Re-review</h2>
      <p>Put the live approvals matching a filter in front of you again. A rubric or model change never does this on its own.</p>
      <label>
        By{" "}
        <select value={by} onChange={(e) => setBy(e.target.value as keyof typeof FILTERS)}>
          {Object.entries(FILTERS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>{" "}
      <label>
        Value <input value={value} onChange={(e) => setValue(e.target.value)} />
      </label>{" "}
      <Button onClick={() => value.trim() && onQueue({ [by]: value.trim() })}>Queue re-review</Button>
      {queued !== null && <p role="status">{queued} queued.</p>}
    </section>
  );
};

/** Supervisor spot-checks: the error rate and pause of each kind, the samples waiting for a verdict, and re-review. */
export const SpotChecksScreen = ({
  kinds,
  samples,
  window = 50,
  queued = null,
  error,
  onVerdict,
  onResume,
  onReReview,
}: {
  kinds: KindReport[];
  samples: SampleItem[];
  window?: number;
  queued?: number | null;
  error?: string;
  onVerdict: (id: string, verdict: "confirm" | "reject", note: string) => void;
  onResume: (kind: string) => void;
  onReReview: (filter: ReReviewFilter) => void;
}) => (
  <section aria-label="Spot-checks">
    <h1>Spot-checks</h1>
    {error && <p role="alert">{error}</p>}
    <ul>
      {kinds.map((report) => (
        <KindRow key={report.kind} report={report} window={window} onResume={onResume} />
      ))}
    </ul>
    <h2>Waiting for you</h2>
    {!error && samples.length === 0 && <p>No samples are waiting.</p>}
    <ul>
      {samples.map((sample) => (
        <SampleCard key={sample.id} sample={sample} onVerdict={onVerdict} />
      ))}
    </ul>
    <ReReviewForm onQueue={onReReview} queued={queued} />
  </section>
);

type Loaded = { kinds: KindReport[]; samples: SampleItem[]; error?: string };

const BASE = "/api/content-approval/sampling";

export const loadSpotChecks = async (send: typeof fetch = fetch): Promise<Loaded> => {
  const response = await send(`${BASE}/spot-checks`, { credentials: "same-origin" });
  if (!response.ok) return { kinds: [], samples: [], error: response.status === 403 ? "Supervisors only." : "Could not load the spot-checks." };
  return (await response.json()) as Loaded;
};

const post = (path: string, body: unknown, send: typeof fetch) =>
  send(`${BASE}${path}`, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export const sendVerdict = (id: string, verdict: "confirm" | "reject", note: string, send: typeof fetch = fetch) =>
  post(`/spot-checks/${id}/verdict`, { verdict, ...(note.trim() && { note: note.trim() }) }, send);

export const resumeKind = (kind: string, send: typeof fetch = fetch) => post(`/kinds/${kind}/resume`, {}, send);

export const queueReReview = async (filter: ReReviewFilter, send: typeof fetch = fetch): Promise<number | null> => {
  const response = await post("/re-reviews", filter, send);
  return response.ok ? ((await response.json()) as { queued: number }).queued : null;
};

export const SpotChecksRoute = () => {
  const [loaded, setLoaded] = useState<Loaded>({ kinds: [], samples: [] });
  const [queued, setQueued] = useState<number | null>(null);
  const refresh = useCallback(() => loadSpotChecks().then(setLoaded), []);
  useEffect(() => void refresh(), [refresh]);
  return (
    <SpotChecksScreen
      {...loaded}
      queued={queued}
      onVerdict={async (id, verdict, note) => {
        await sendVerdict(id, verdict, note);
        await refresh();
      }}
      onResume={async (kind) => {
        await resumeKind(kind);
        await refresh();
      }}
      onReReview={async (filter) => {
        setQueued(await queueReReview(filter));
        await refresh();
      }}
    />
  );
};
