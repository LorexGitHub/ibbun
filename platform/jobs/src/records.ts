import { z } from "zod";
import type { JobContract, JobHandler } from "./contract.ts";

/** What travels on the queue: the job's name and the payload its contract already accepted. */
const Message = z.object({ name: z.string(), payload: z.unknown() });

export const messageBody = (contract: JobContract, payload: unknown): string => JSON.stringify({ name: contract.name, payload });

/** The part of an SQS record a handler needs. Lambda's event records and `ReceiveMessage` results both have it. */
export type QueueRecord = { readonly messageId: string; readonly body: string };

const runRecord = async (handlers: ReadonlyMap<string, JobHandler>, record: QueueRecord) => {
  const { name, payload } = Message.parse(JSON.parse(record.body));
  const handler = handlers.get(name);
  if (!handler) throw new Error(`no handler for job ${name}`);
  await handler.handle(handler.contract.payload.parse(payload));
};

/** Runs every record with its job's handler, side by side. Returns the ids of the records that failed, for SQS to deliver again. */
export const runRecords = async (handlers: ReadonlyMap<string, JobHandler>, records: readonly QueueRecord[]): Promise<string[]> => {
  const results = await Promise.allSettled(records.map((record) => runRecord(handlers, record)));
  return records.flatMap((record, i) => {
    const result = results[i]!;
    if (result.status === "fulfilled") return [];
    console.error(`job ${record.messageId} failed:`, result.reason);
    return [record.messageId];
  });
};

export const byName = (handlers: readonly JobHandler[]): Map<string, JobHandler> => new Map(handlers.map((h) => [h.contract.name, h]));

/** The Lambda event for an SQS trigger, reduced to what the handler reads. */
export type SqsEvent = { readonly Records: readonly QueueRecord[] };
export type SqsBatchResponse = { batchItemFailures: { itemIdentifier: string }[] };

/**
 * The worker Lambda's handler. Reports each failed record on its own (`ReportBatchItemFailures`),
 * so SQS retries only those and the rest of the batch is deleted.
 */
export const sqsHandler = (handlers: readonly JobHandler[]) => {
  const named = byName(handlers);
  return async (event: SqsEvent): Promise<SqsBatchResponse> => ({
    batchItemFailures: (await runRecords(named, event.Records)).map((itemIdentifier) => ({ itemIdentifier })),
  });
};
