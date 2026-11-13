import { DeleteMessageBatchCommand, ReceiveMessageCommand, SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { Cron } from "croner";
import type { z } from "zod";
import type { JobContract, JobHandler, Jobs } from "./contract.ts";
import { messageBody, runRecords } from "./records.ts";

export type SqsJobsOptions = {
  readonly client: SQSClient;
  /** The one queue every job goes to. Its redrive policy moves a job to the dead-letter queue after 3 receives. */
  readonly queueUrl: string;
  /** How long one `ReceiveMessage` waits for a job (long polling). */
  readonly waitSeconds?: number;
};

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
type Queue = { readonly client: SQSClient; readonly queueUrl: string; readonly waitSeconds: number };

/** One long poll: runs what arrives and deletes what succeeded. A failed job stays, for SQS to deliver again. */
const receiveAndRun = async ({ client, queueUrl, waitSeconds }: Queue, handlers: ReadonlyMap<string, JobHandler>, signal: AbortSignal) => {
  const command = new ReceiveMessageCommand({ QueueUrl: queueUrl, MaxNumberOfMessages: 10, WaitTimeSeconds: waitSeconds });
  const { Messages = [] } = await client.send(command, { abortSignal: signal });
  const records = Messages.map((m) => ({ messageId: m.MessageId!, body: m.Body!, receipt: m.ReceiptHandle! }));
  const failed = new Set(await runRecords(handlers, records));
  const done = records.filter((r) => !failed.has(r.messageId));
  if (done.length === 0) return;
  const entries = done.map((r, i) => ({ Id: String(i), ReceiptHandle: r.receipt }));
  await client.send(new DeleteMessageBatchCommand({ QueueUrl: queueUrl, Entries: entries }));
};

/** Polls until stopped. `stop` lets the jobs in hand finish. */
const startPolling = (queue: Queue, handlers: ReadonlyMap<string, JobHandler>) => {
  const abort = new AbortController();
  const loop = async () => {
    while (!abort.signal.aborted) {
      await receiveAndRun(queue, handlers, abort.signal).catch(async (error) => {
        if (abort.signal.aborted) return;
        console.error("jobs: receiving from the queue failed:", error);
        await pause(1000);
      });
    }
  };
  const done = loop();
  return () => (abort.abort(), done);
};

/**
 * Jobs on SQS. On AWS only `enqueue` is used: the worker Lambda runs `sqsHandler`, and
 * EventBridge Scheduler sends the scheduled jobs. Locally `apps/worker` uses `work` to long-poll
 * the queue and `schedule` to run the crons in-process, against ElasticMQ.
 */
export const createSqsJobs = ({ client, queueUrl, waitSeconds = 20 }: SqsJobsOptions): Jobs => {
  const handlers = new Map<string, JobHandler>();
  const crons = new Map<string, Cron>();
  let stopPolling: (() => Promise<void>) | undefined;
  const send = async (contract: JobContract, data: unknown) => {
    await client.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: messageBody(contract, data) }));
  };

  return {
    async enqueue<S extends z.ZodType>(contract: JobContract<S>, payload: z.input<S>) {
      await send(contract, contract.payload.parse(payload));
    },
    async schedule<S extends z.ZodType>(contract: JobContract<S>, cron: string, payload: z.input<S>) {
      const data = contract.payload.parse(payload);
      crons.get(contract.name)?.stop();
      const fire = () => void send(contract, data).catch((error) => console.error(`jobs: scheduling ${contract.name} failed:`, error));
      crons.set(contract.name, new Cron(cron, { timezone: "UTC" }, fire));
    },
    async work(list) {
      for (const h of list) handlers.set(h.contract.name, h);
      stopPolling ??= startPolling({ client, queueUrl, waitSeconds }, handlers);
    },
    async stop() {
      for (const cron of crons.values()) cron.stop();
      crons.clear();
      await stopPolling?.();
      stopPolling = undefined;
    },
  };
};

/** ElasticMQ: any region and credentials, and the endpoint is the queue URL's own host. */
const local = (queueUrl: string) => ({ region: "elasticmq", endpoint: new URL(queueUrl).origin, credentials: { accessKeyId: "local", secretAccessKey: "local" } });

const unconfigured = (): Promise<never> => Promise.reject(new Error("JOBS_QUEUE_URL is not set"));

/**
 * The queue named by `JOBS_QUEUE_URL`. On AWS the Lambda's role signs the calls, in its own region; locally, with no
 * AWS credentials in the environment, ElasticMQ accepts any. A missing URL fails on first use, so
 * the API and the worker start without it.
 */
export const createSqsJobsFromEnv = (env: Record<string, string | undefined>): Jobs => {
  const queueUrl = env.JOBS_QUEUE_URL;
  if (!queueUrl) return { enqueue: unconfigured, schedule: unconfigured, work: unconfigured, stop: async () => {} };
  const client = new SQSClient(env.AWS_ACCESS_KEY_ID ? {} : local(queueUrl));
  return createSqsJobs({ client, queueUrl });
};
