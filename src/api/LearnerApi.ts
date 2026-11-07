import * as HttpApi from "effect/http-api/HttpApi";
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint";
import * as HttpApiError from "effect/http-api/HttpApiError";
import * as HttpApiGroup from "effect/http-api/HttpApiGroup";
import * as Schema from "effect/Schema";

export const StudyItemKind = Schema.Literals(["kanji", "word", "grammar", "listening"]);
export type StudyItemKind = typeof StudyItemKind.Type;

export const Grade = Schema.Literals([0, 1, 2, 3]);

export const LearnerItem = Schema.Struct({
  kind: StudyItemKind,
  id: Schema.String,
  known: Schema.optional(Schema.Boolean),
  reviewCount: Schema.optional(Schema.Number),
  lastGrade: Schema.optional(Grade),
  lastReviewedAt: Schema.optional(Schema.String),
});
export type LearnerItem = typeof LearnerItem.Type;

export const Review = Schema.Struct({ kind: StudyItemKind, id: Schema.String, grade: Grade });
export type Review = typeof Review.Type;

const authorization = { authorization: Schema.optional(Schema.String) };

export const health = HttpApiEndpoint.get("health", "/api/health", {
  success: Schema.Struct({ ok: Schema.Boolean }),
});

export const listItems = HttpApiEndpoint.get("listItems", "/api/me/items", {
  headers: authorization,
  success: Schema.Struct({ items: Schema.Array(LearnerItem) }),
  error: HttpApiError.Unauthorized,
});

export const setKnown = HttpApiEndpoint.put("setKnown", "/api/me/items/:kind/:id", {
  params: { kind: StudyItemKind, id: Schema.String },
  headers: authorization,
  payload: Schema.Struct({ known: Schema.Boolean }),
  success: LearnerItem,
  error: HttpApiError.Unauthorized,
});

export const recordReview = HttpApiEndpoint.post("recordReview", "/api/me/reviews", {
  headers: authorization,
  payload: Review,
  success: Schema.Struct({ ...Review.fields, at: Schema.String }),
  error: HttpApiError.Unauthorized,
});

export const LearnerApi = HttpApi.make("LearnerApi").add(
  HttpApiGroup.make("learner").add(health, listItems, setKnown, recordReview),
);
