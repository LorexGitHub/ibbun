import type { z } from "zod";

/** A job's name and the shape of its payload. The contract may live in core or in the slice that owns the handler. */
export type JobContract<S extends z.ZodType = z.ZodType> = { readonly name: string; readonly payload: S };

export const defineJob = <S extends z.ZodType>(name: string, payload: S): JobContract<S> => ({ name, payload });

/** When a job starts by itself: a cron expression (UTC) and the payload each run gets. */
export type Schedule<S extends z.ZodType = z.ZodType> = { readonly cron: string; readonly payload: z.input<S> };

/** The code that runs a job. `handle` receives a payload already checked against the contract. */
export type JobHandler<S extends z.ZodType = z.ZodType> = {
  readonly contract: JobContract<S>;
  readonly handle: (payload: z.output<S>) => Promise<void>;
  /** The worker starts the job on this schedule, with no human involved. */
  readonly schedule?: Schedule<S>;
};

export const handler = <S extends z.ZodType>(
  contract: JobContract<S>,
  handle: (payload: z.output<S>) => Promise<void>,
  schedule?: Schedule<S>,
): JobHandler<S> => ({ contract, handle, schedule });

export interface Jobs {
  /** Queues a job. Rejects when the payload does not match the contract. */
  enqueue<S extends z.ZodType>(contract: JobContract<S>, payload: z.input<S>): Promise<void>;
  /** Runs `contract` with `payload` on a cron schedule (UTC). Calling it again for the same job name replaces the schedule. */
  schedule<S extends z.ZodType>(contract: JobContract<S>, cron: string, payload: z.input<S>): Promise<void>;
  /** Starts running these handlers. A job that throws is failed, and retried by the real queue. */
  work(handlers: JobHandler[]): Promise<void>;
  stop(): Promise<void>;
}
