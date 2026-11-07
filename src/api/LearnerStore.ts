import * as DynamoDB from "@alchemy.run/aws/DynamoDB";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { LearnerItem, type Review, type StudyItemKind } from "./LearnerApi.ts";

export class LearnerStoreError extends Data.TaggedError("LearnerStoreError")<{
  readonly cause: unknown;
}> {}

export class LearnerStore extends Context.Service<
  LearnerStore,
  {
    listItems(learnerId: string): Effect.Effect<ReadonlyArray<LearnerItem>, LearnerStoreError>;
    setKnown(
      learnerId: string,
      kind: StudyItemKind,
      id: string,
      known: boolean,
    ): Effect.Effect<LearnerItem, LearnerStoreError>;
    recordReview(learnerId: string, review: Review, at: string): Effect.Effect<void, LearnerStoreError>;
  }
>()("LearnerStore") {}

// Keys, one partition per Learner:
//   pk = LEARNER#<cognito sub>
//   sk = ITEM#<kind>#<id>                Known flag and the Mastery summary for one Study Item
//   sk = REVIEW#<iso time>#<kind>#<id>   one Review, append-only; the source of truth for Mastery
const pk = (learnerId: string) => ({ S: `LEARNER#${learnerId}` });
const itemSk = (kind: StudyItemKind, id: string) => ({ S: `ITEM#${kind}#${id}` });

const decodeItem = Schema.decodeUnknownEffect(LearnerItem);

type AttributeValue = Parameters<typeof DynamoDB.fromAttributeValue>[0];

const fromRow = (row: Record<string, AttributeValue | undefined> = {}) => {
  const { sk = "", known, reviewCount, lastGrade, lastReviewedAt } = Object.fromEntries(
    Object.entries(row).map(([name, value]) => [name, value && DynamoDB.fromAttributeValue(value)]),
  );
  const [, kind, ...id] = String(sk).split("#");
  return decodeItem({ kind, id: id.join("#"), known, reviewCount, lastGrade, lastReviewedAt });
};

const storeError = (cause: unknown) => new LearnerStoreError({ cause });

export const LearnerStoreDynamoDB = Layer.provideMerge(
  Layer.effect(
    LearnerStore,
    Effect.gen(function* () {
      const table = yield* DynamoDB.Table("LearnerTable", {
        partitionKey: "pk",
        sortKey: "sk",
        attributes: { pk: "S", sk: "S" },
        billingMode: "PAY_PER_REQUEST",
        pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      });
      const query = yield* DynamoDB.Query(table);
      const updateItem = yield* DynamoDB.UpdateItem(table);
      const transactWrite = yield* DynamoDB.TransactWriteItems(table);

      return LearnerStore.of({
        listItems: (learnerId) =>
          query({
            KeyConditionExpression: "pk = :pk AND begins_with(sk, :item)",
            ExpressionAttributeValues: { ":pk": pk(learnerId), ":item": { S: "ITEM#" } },
          }).pipe(
            Effect.flatMap((out) => Effect.forEach(out.Items ?? [], (row) => fromRow(row))),
            Effect.mapError(storeError),
          ),

        setKnown: (learnerId, kind, id, known) =>
          updateItem({
            Key: { pk: pk(learnerId), sk: itemSk(kind, id) },
            UpdateExpression: "SET known = :known",
            ExpressionAttributeValues: { ":known": { BOOL: known } },
            ReturnValues: "ALL_NEW",
          }).pipe(
            Effect.flatMap((out) => fromRow(out.Attributes)),
            Effect.mapError(storeError),
          ),

        recordReview: (learnerId, review, at) =>
          transactWrite({
            TransactItems: [
              {
                Put: {
                  Table: table.LogicalId,
                  Item: {
                    pk: pk(learnerId),
                    sk: { S: `REVIEW#${at}#${review.kind}#${review.id}` },
                    grade: { N: String(review.grade) },
                  },
                },
              },
              {
                Update: {
                  Table: table.LogicalId,
                  Key: { pk: pk(learnerId), sk: itemSk(review.kind, review.id) },
                  UpdateExpression: "SET lastReviewedAt = :at, lastGrade = :grade ADD reviewCount :one",
                  ExpressionAttributeValues: {
                    ":at": { S: at },
                    ":grade": { N: String(review.grade) },
                    ":one": { N: "1" },
                  },
                },
              },
            ],
          }).pipe(Effect.asVoid, Effect.mapError(storeError)),
      });
    }),
  ),
  Layer.mergeAll(DynamoDB.QueryHttp, DynamoDB.UpdateItemHttp, DynamoDB.TransactWriteItemsHttp),
);
