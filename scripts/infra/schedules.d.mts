export type ScheduledJob = { readonly name: string; readonly cron: string; readonly payload: unknown };
export declare const scheduledJobs: () => Promise<ScheduledJob[]>;
