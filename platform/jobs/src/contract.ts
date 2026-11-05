import type { z } from "zod";

/** A job's name and the shape of its payload. The contract may live in core or in the slice that owns the handler. */
export type JobContract<S extends z.ZodType = z.ZodType> = { readonly name: string; readonly payload: S };

export const defineJob = <S extends z.ZodType>(name: string, payload: S): JobContract<S> => ({ name, payload });

/** The code that runs a job. `handle` receives a payload already checked against the contract. */
export type JobHandler<S extends z.ZodType = z.ZodType> = {
  readonly contract: JobContract<S>;
  readonly handle: (payload: z.output<S>) => Promise<void>;
};

export const handler = <S extends z.ZodType>(
  contract: JobContract<S>,
  handle: (payload: z.output<S>) => Promise<void>,
): JobHandler<S> => ({ contract, handle });

export interface Jobs {
  /** Queues a job. Rejects when the payload does not match the contract. */
  enqueue<S extends z.ZodType>(contract: JobContract<S>, payload: z.input<S>): Promise<void>;
  /** Starts running these handlers. A job that throws is failed, and retried by the real queue. */
  work(handlers: JobHandler[]): Promise<void>;
  stop(): Promise<void>;
}
