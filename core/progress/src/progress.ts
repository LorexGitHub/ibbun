import type { DbOrTx } from "@mojibun/db";
import type { LearnerId, StudyItemId } from "@mojibun/shared";
import { project, type ItemProgress } from "./projection.ts";
import { NewReview, type Review } from "./review.ts";

/** The `progress` core interface: the Review log and the reads folded from it. */
export type Progress = {
  /** Appends one Review. Nothing in the log is ever updated or deleted. */
  record(review: NewReview, tx?: DbOrTx): Promise<Review>;
  /** A Learner's log, oldest first, optionally for one Study Item. */
  log(learnerId: LearnerId, studyItemId?: StudyItemId, tx?: DbOrTx): Promise<Review[]>;
  /** Schedule and Mastery for one Study Item. */
  item(learnerId: LearnerId, studyItemId: StudyItemId, tx?: DbOrTx): Promise<ItemProgress>;
  /** Every Study Item the Learner has any Review of, except New ones. */
  items(learnerId: LearnerId, tx?: DbOrTx): Promise<ItemProgress[]>;
  /** Study Items whose scheduled Review is due at `at`, soonest first. */
  due(learnerId: LearnerId, at: Date, tx?: DbOrTx): Promise<StudyItemId[]>;
  known(learnerId: LearnerId, tx?: DbOrTx): Promise<StudyItemId[]>;
  /** For `learning-path`: items that passed Learn, Placement or "I know this". */
  introduced(learnerId: LearnerId, tx?: DbOrTx): Promise<StudyItemId[]>;
  /** Whether any Learner has a Review of this Example or Study Item (docs/content-approval.md#when-a-spot-check-rejects-live-content). */
  met(target: MetTarget, tx?: DbOrTx): Promise<boolean>;
};

export type MetTarget = { exampleId: string } | { studyItemId: StudyItemId };

/** Where a Progress keeps its log. The real one is Postgres; the fake is an array. */
export type ReviewStore = {
  append(review: Review, tx?: DbOrTx): Promise<void>;
  /** Oldest first, in the order they were recorded when two share a time. */
  read(learnerId: LearnerId, studyItemId?: StudyItemId, tx?: DbOrTx): Promise<Review[]>;
  /** Whether any Learner's log has a Review of this Example or Study Item. */
  exists(target: MetTarget, tx?: DbOrTx): Promise<boolean>;
};

const groupByItem = (reviews: Review[]) => {
  const byItem = new Map<StudyItemId, Review[]>(reviews.map((r) => [r.studyItemId, []]));
  for (const r of reviews) byItem.get(r.studyItemId)!.push(r);
  return byItem;
};

/** Builds Progress over a store. Every read replays the log, so the log alone is the state. */
export const createProgressOver = (store: ReviewStore, newId: () => string): Progress => {
  const items = async (learnerId: LearnerId, tx?: DbOrTx) =>
    [...groupByItem(await store.read(learnerId, undefined, tx))]
      .map(([id, reviews]) => project(id, reviews))
      .filter((p) => p.introduced);
  const ids = (list: ItemProgress[]) => list.map((p) => p.studyItemId);
  return {
    async record(input, tx) {
      const parsed = NewReview.parse(input);
      const review: Review = { ...parsed, at: new Date(parsed.at).toISOString(), id: newId() };
      await store.append(review, tx);
      return review;
    },
    log: (learnerId, studyItemId, tx) => store.read(learnerId, studyItemId, tx),
    item: async (learnerId, studyItemId, tx) => project(studyItemId, await store.read(learnerId, studyItemId, tx)),
    items,
    async due(learnerId, at, tx) {
      const due = (await items(learnerId, tx)).filter((p) => p.due! <= at);
      return ids(due.sort((a, b) => a.due!.getTime() - b.due!.getTime()));
    },
    known: async (learnerId, tx) => ids((await items(learnerId, tx)).filter((p) => p.known)),
    introduced: async (learnerId, tx) => ids(await items(learnerId, tx)),
    met: (target, tx) => store.exists(target, tx),
  };
};
