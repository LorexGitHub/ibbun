// Seeds the promo's demo Learner with a believable two-week history, so Today shows a streak,
// Reviews due and Known counts instead of zeros. Safe to run again: it makes a fresh Learner each run.
// Run: node --env-file-if-exists=.env assets/showcase/commercial/seed-demo.ts  (prints the email)
import { createDb } from "../../../platform/db/src/index.ts";
import { addLearner } from "../../../core/learner/src/learners.ts";
import { hashPassword } from "../../../core/learner/src/password.ts";
import { createProgress } from "../../../core/progress/src/index.ts";

export const DEMO_PASSWORD = "ibbun-promo-demo-2026";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const db = createDb(url, { max: 2 });
const DAY = 86_400_000;
const now = Date.now();

const n5 = async (withExamples: boolean, type: string, limit: number, offset = 0): Promise<string[]> => {
  const { rows } = await db.$client.query(
    `select si.id from content_graph.study_item si
       join content_graph.computed_level cl on cl.record_id = si.id and cl.level = 'N5'
      where si.approval = 'approved' and not si.retired and si.type = $1
        and ${withExamples ? "" : "not"} exists (select 1 from content_graph.example e
              where e.study_item_id = si.id and e.approval = 'approved' and not e.retired)
      order by si.id limit $2 offset $3`,
    [type, limit, offset],
  );
  return rows.map((r: { id: string }) => r.id);
};

try {
  const email = `promo-${now}@ibbun.test`;
  const learner = await addLearner(db, { email, role: "learner", emailVerified: true, passwordHash: await hashPassword(DEMO_PASSWORD) });
  const progress = createProgress(db);
  const learnerId = learner.id as never;
  const rec = (studyItemId: string, kind: "manual" | "learn" | "srs", daysAgo: number, extra: object = {}) =>
    progress.record({ learnerId, studyItemId: studyItemId as never, kind, passed: true, at: new Date(now - daysAgo * DAY).toISOString(), ...extra });

  // Placement: what the Learner already knew on day one.
  const placed = [...(await n5(false, "word", 140)), ...(await n5(false, "kanji", 30))];
  for (const id of placed) {
    await rec(id, "manual", 40, { source: "placement" });
    await rec(id, "srs", 18);
  }

  // Fourteen days of Learn batches, each reviewed since, so a day's worth comes due today and the streak is unbroken.
  const studied = [...(await n5(true, "word", 56)), ...(await n5(true, "kanji", 14))];
  for (const [i, id] of studied.entries()) {
    const learnedDaysAgo = 14 - (i % 14);
    await rec(id, "learn", learnedDaysAgo + 0.1);
    if (learnedDaysAgo > 2) await rec(id, "srs", Math.max(1, learnedDaysAgo - 3) + 0.05);
  }
  console.log(email);
} finally {
  await db.$client.end();
}
