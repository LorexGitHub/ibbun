/**
 * How the stack runs the worker Lambda (ADR 0015). One job per invocation, so the concurrency cap
 * is the number of jobs running at once: at most 5 Claude calls in flight, and a bounded number
 * of database connections against Aurora. The queue's visibility timeout is 6 × the timeout, as
 * AWS advises for an SQS trigger, so a job is never handed out again while it may still run.
 */
export const workerLambda = { timeoutSeconds: 900, reservedConcurrency: 5, batchSize: 1 } as const;
