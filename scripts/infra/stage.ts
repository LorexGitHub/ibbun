/**
 * What a stage deploys (ADR 0015, ADR 0017). Every stage has CloudFront, the web, audio and
 * content buckets, the API function, Aurora, SSM and the budget alert. A full stage adds the
 * jobs side; the showcase stage leaves it out and has no queue to watch.
 */
export type StageParts = {
  readonly showcase: boolean;
  /** The queue, its dead-letter queue and the dead-letter alarm. */
  readonly queue: boolean;
  readonly worker: boolean;
  readonly schedules: boolean;
  /** The Sudachi and VOICEVOX container-image functions. */
  readonly containers: boolean;
  readonly importTask: boolean;
  readonly mail: boolean;
};

export const SHOWCASE_STAGE = "showcase";

export const stageParts = (stage: string): StageParts => {
  const full = stage !== SHOWCASE_STAGE;
  return { showcase: !full, queue: full, worker: full, schedules: full, containers: full, importTask: full, mail: full };
};

/** A name that fits AWS limits in a function name or a bucket name: `dev_david` becomes `dev-david`. */
export const stageSlug = (stage: string): string => stage.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
