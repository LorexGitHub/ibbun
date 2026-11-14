import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { HeadObjectCommand, NotFound, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import type { Db } from "@ibbun/db";

type Pool = Db["$client"];

type Row = Record<string, unknown>;
/** A table of the Content Graph, and the rows of it that a Learner may see. */
type Spec = {
  table: string;
  pk: string;
  /** Only rows whose approval is `approved` and which are not retired. */
  lifecycle: boolean;
  /** The rows a row points at, as [table, id]. A row is copied only if each parent was copied. */
  refs: (row: Row) => [string, unknown][];
  /** Columns holding the object key of a generated audio file. */
  audio?: string[];
};

const fk =
  (...pairs: [column: string, table: string][]) =>
  (row: Row): [string, unknown][] =>
    pairs.map(([column, table]) => [table, row[column]]);
const own = (table: string, refs: Spec["refs"], extra: Partial<Spec> = {}): Spec => ({ table, pk: "id", lifecycle: true, refs, ...extra });
const ofStudyItem = (table: string): Spec => ({ table, pk: "study_item_id", lifecycle: false, refs: fk(["study_item_id", "study_item"]) });

/** Parents come before children, so each foreign key finds its row. Import and generation bookkeeping, queues, overrides and approval decisions stay on the Supervisor's machine. */
export const PUBLISHED: Spec[] = [
  own("study_item", () => []),
  ofStudyItem("kanji"),
  ofStudyItem("word"),
  ofStudyItem("grammar_point"),
  ofStudyItem("listening_clip"),
  own("word_form", fk(["word_id", "word"])),
  own("word_reading", fk(["word_id", "word"])),
  own("word_sense", fk(["word_id", "word"])),
  own("japanese_explanation", (r) => [["word_sense", r.word_sense_id], ["grammar_point", r.grammar_point_id]]),
  own("sentence", () => [], { audio: ["audio_key"] }),
  own("reading_passage", () => []),
  own("example", (r) => [["sentence", r.sentence_id], ["study_item", r.study_item_id], ["word_sense", r.target_sense_id]]),
  own("example_answer", fk(["example_id", "example"])),
  own("word_contains_kanji", fk(["word_id", "word"], ["kanji_id", "kanji"])),
  own("sentence_uses_word", (r) => [["sentence", r.sentence_id], ["word", r.word_id], ["word_form", r.form_id], ["word_reading", r.reading_id], ["word_sense", r.sense_id]]),
  own("sentence_demonstrates_grammar", fk(["sentence_id", "sentence"], ["grammar_point_id", "grammar_point"])),
  own("clip_voices_sentence", fk(["clip_id", "listening_clip"], ["sentence_id", "sentence"]), { audio: ["audio_key"] }),
  own("passage_contains_sentence", fk(["passage_id", "reading_passage"], ["sentence_id", "sentence"])),
  own("grammar_relates_to", fk(["from_id", "grammar_point"], ["to_id", "grammar_point"])),
  own("word_superseded_by", fk(["retired_word_id", "word"], ["word_id", "word"])),
  own("level_candidate", fk(["study_item_id", "study_item"])),
  { table: "computed_level", pk: "record_id", lifecycle: false, refs: (r) => [[String(r.record_table), r.record_id]] },
];

const PROVENANCE: Spec = { table: "provenance", pk: "id", lifecycle: false, refs: () => [] };
const BATCH = 500;
const q = (table: string) => `content_graph."${table}"`;
const LIVE = "approval = 'approved' AND NOT retired";

export type TableReport = { table: string; read: number; copied: number; changed: number };
export type DbReport = { tables: TableReport[]; audioKeys: string[] };

/** Rows of `table` selected by `where`, as JSON, in primary key order, a page at a time. */
async function* pages(source: Pool, table: string, pk: string, where: string) {
  let after: string | null = null;
  for (;;) {
    const { rows }: { rows: { id: string; row: Row }[] } = await source.query(
      `SELECT "${pk}"::text AS id, to_jsonb(t) AS row FROM ${q(table)} t WHERE (${where}) ${after === null ? "" : `AND "${pk}"::text > $1`} ORDER BY "${pk}"::text LIMIT ${BATCH}`,
      after === null ? [] : [after],
    );
    if (!rows.length) return;
    yield rows;
    after = rows[rows.length - 1]!.id;
  }
}

/** Upserts rows in the target; returns how many were new or different. A row equal to the target's is not written at all. */
const upsert = async (target: Pool, spec: Spec, columns: string[], rows: Row[]) => {
  const set = columns.filter((c) => c !== spec.pk).map((c) => `"${c}" = EXCLUDED."${c}"`);
  const conflict = set.length ? `DO UPDATE SET ${set.join(", ")} WHERE (t.*) IS DISTINCT FROM (EXCLUDED.*)` : "DO NOTHING";
  const result = await target.query(
    `INSERT INTO ${q(spec.table)} AS t SELECT * FROM jsonb_populate_recordset(null::${q(spec.table)}, $1::jsonb) ON CONFLICT ("${spec.pk}") ${conflict}`,
    [JSON.stringify(rows)],
  );
  return result.rowCount ?? 0;
};

const columnsOf = async (pool: Pool, table: string) =>
  (
    await pool.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'content_graph' AND table_name = $1 ORDER BY ordinal_position",
      [table],
    )
  ).rows.map((r) => r.column_name);

/**
 * Copies approved Content Graph records from `source` to `target` in dependency order.
 * A record is copied only if it is approved, not retired, and everything it points at was copied.
 * Writing a row that already matches changes nothing, so a second run reports `changed: 0` everywhere.
 * Nothing is deleted from the target: a record retired since the last publish stays there until the stage is rebuilt.
 */
export const copyContent = async (source: Pool, target: Pool): Promise<DbReport> => {
  const copied = new Map<string, Set<string>>();
  const audioKeys = new Set<string>();
  const tables: TableReport[] = [];

  const liveProvenance = PUBLISHED.filter((s) => s.lifecycle)
    .map((s) => `SELECT provenance_id FROM ${q(s.table)} WHERE ${LIVE}`)
    .join(" UNION ");
  const plan: [Spec, string][] = [
    [PROVENANCE, `id IN (${liveProvenance})`],
    ...PUBLISHED.map((s): [Spec, string] => [s, s.lifecycle ? LIVE : "true"]),
  ];

  for (const [spec, where] of plan) {
    const columns = await columnsOf(target, spec.table);
    const ids = new Set<string>();
    copied.set(spec.table, ids);
    const report: TableReport = { table: spec.table, read: 0, copied: 0, changed: 0 };
    for await (const page of pages(source, spec.table, spec.pk, where)) {
      report.read += page.length;
      const keep = page.filter(({ row }) => spec.refs(row).every(([table, id]) => id == null || copied.get(table)?.has(String(id))));
      for (const { id, row } of keep) {
        ids.add(id);
        for (const column of spec.audio ?? []) if (typeof row[column] === "string") audioKeys.add(row[column]);
      }
      report.copied += keep.length;
      if (keep.length) report.changed += await upsert(target, spec, columns, keep.map((k) => k.row));
    }
    tables.push(report);
  }
  return { tables, audioKeys: [...audioKeys].sort() };
};

/** Where generated audio is read from, or null if the file is not there. */
export type AudioSource = (key: string) => Promise<Uint8Array | null>;
/** Where it is published. Keys are content hashes, so an object that exists never needs writing again. */
export interface AudioTarget {
  has(key: string): Promise<boolean>;
  put(key: string, audio: Uint8Array): Promise<void>;
}

export type AudioReport = { uploaded: number; unchanged: number; missing: string[] };

export const directoryAudioSource =
  (dir: string): AudioSource =>
  (key) =>
    readFile(join(dir, key)).then(
      (b) => new Uint8Array(b),
      () => null,
    );

/** `s3://bucket/prefix/`: objects at `prefix + key`, as CloudFront serves them under `/audio/*`. */
export const s3AudioTarget = (client: S3Client, location: string): AudioTarget => {
  const [bucket, ...path] = location.slice("s3://".length).split("/");
  const prefix = path.filter(Boolean).map((p) => `${p}/`).join("");
  return {
    async has(key) {
      return client.send(new HeadObjectCommand({ Bucket: bucket, Key: prefix + key })).then(
        () => true,
        (error) => {
          if (error instanceof NotFound) return false;
          throw error;
        },
      );
    },
    async put(key, audio) {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: prefix + key, Body: audio, ContentType: "audio/ogg", CacheControl: "public, max-age=31536000, immutable" }),
      );
    },
  };
};

export const publishAudio = async (keys: string[], from: AudioSource, to: AudioTarget): Promise<AudioReport> => {
  const report: AudioReport = { uploaded: 0, unchanged: 0, missing: [] };
  for (const key of keys) {
    if (await to.has(key)) {
      report.unchanged++;
      continue;
    }
    const audio = await from(key);
    if (!audio) report.missing.push(key);
    else {
      await to.put(key, audio);
      report.uploaded++;
    }
  }
  return report;
};
