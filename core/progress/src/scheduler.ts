import { createEmptyCard, fsrs, Rating, State, type Card } from "ts-fsrs";
import type { Review } from "./review.ts";

/** ADR 0001: FSRS-6 default weights, retention 0.9, 4h steps, 365-day cap. No fuzz, so replays agree. */
const engine = fsrs({
  request_retention: 0.9,
  maximum_interval: 365,
  enable_fuzz: false,
  enable_short_term: true,
  learning_steps: ["4h"],
  relearning_steps: ["4h"],
});

export type Schedule = {
  due: Date;
  stability: number;
  relearning: boolean;
};

/** The single place ts-fsrs is called. Feed it only `srs` and `manual` Reviews, oldest first. */
export const Scheduler = {
  feeds: (review: Review) => review.kind === "srs" || review.kind === "manual",
  fold(reviews: Review[], start: Date): Schedule {
    let card: Card = createEmptyCard(start);
    for (const r of reviews) {
      const grade = r.kind === "manual" ? Rating.Easy : r.passed ? Rating.Good : Rating.Again;
      card = engine.next(card, new Date(r.at), grade).card;
    }
    return { due: card.due, stability: card.stability, relearning: card.state === State.Relearning };
  },
};
