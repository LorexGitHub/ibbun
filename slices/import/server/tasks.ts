import { ECSClient, ListTasksCommand, RunTaskCommand } from "@aws-sdk/client-ecs";
import { z } from "zod";
import type { Dataset } from "@ibbun/content-graph/authoring";

/**
 * Where a refresh runs on AWS (#258). `lambda`: inside the worker Lambda, whose invocation stops at 15 minutes.
 * `fargate`: a task of its own from the worker's image, for a source that may not finish well inside that.
 * Locally, and wherever no task cluster is configured, every refresh runs in the worker.
 */
export type Home = "lambda" | "fargate";

/** One refresh handed to a task: the dataset, and whether it releases a run the circuit breaker held. */
export type TaskRequest = { dataset: Dataset; release: boolean };

/** Starts a refresh as a task of its own. While a task for that dataset is still running, it starts none, because SQS delivers a job at least once. */
export type ImportTasks = { start(request: TaskRequest): Promise<"started" | "already running"> };

/** How the task container learns what to run. The task definition sets the entry point to `slices/import/server/import-task.ts`. */
export const TASK_ENV = { dataset: "IMPORT_DATASET", release: "IMPORT_RELEASE" } as const;

/** The request a task container was started with, for one of the datasets it knows. */
export const taskRequestFromEnv = (env: Record<string, string | undefined>, known: readonly [Dataset, ...Dataset[]]): TaskRequest => {
  const parsed = z.object({ [TASK_ENV.dataset]: z.enum(known), [TASK_ENV.release]: z.enum(["true", "false"]).default("false") }).parse(env);
  return { dataset: parsed[TASK_ENV.dataset], release: parsed[TASK_ENV.release] === "true" };
};

export type EcsTaskConfig = {
  readonly cluster: string;
  readonly taskDefinition: string;
  /** The container in the task definition that runs the import. */
  readonly container: string;
  /** Public subnets: the task downloads from the internet and the stack has no NAT gateway (ADR 0015). */
  readonly subnets: readonly string[];
  readonly securityGroups: readonly string[];
};

type Send = Pick<ECSClient, "send">["send"];

/** Fargate tasks through `ECS.RunTask`, tagged `startedBy: import.<dataset>` so a running one is found again. */
export const ecsImportTasks = (client: { send: Send }, config: EcsTaskConfig): ImportTasks => ({
  async start({ dataset, release }) {
    const { cluster } = config;
    const startedBy = `import.${dataset}`;
    const { taskArns = [] } = await client.send(new ListTasksCommand({ cluster, startedBy, desiredStatus: "RUNNING" }));
    if (taskArns.length > 0) return "already running";
    const environment = [
      { name: TASK_ENV.dataset, value: dataset },
      { name: TASK_ENV.release, value: String(release) },
    ];
    const { failures = [] } = await client.send(
      new RunTaskCommand({
        cluster,
        taskDefinition: config.taskDefinition,
        launchType: "FARGATE",
        count: 1,
        startedBy,
        networkConfiguration: { awsvpcConfiguration: { subnets: [...config.subnets], securityGroups: [...config.securityGroups], assignPublicIp: "ENABLED" } },
        overrides: { containerOverrides: [{ name: config.container, environment }] },
      }),
    );
    if (failures.length > 0) throw new Error(`import.${dataset}: ECS did not start the task: ${failures.map((f) => `${f.arn ?? "task"} ${f.reason}`).join("; ")}`);
    return "started";
  },
});

const list = (value: string | undefined) => (value ?? "").split(",").filter(Boolean);

/** The Fargate launcher the stack configures through `IMPORT_TASK_*`, or null where there is none, so every refresh runs in the worker. */
export const importTasksFromEnv = (env: Record<string, string | undefined>, client?: { send: Send }): ImportTasks | null => {
  const { IMPORT_TASK_CLUSTER: cluster, IMPORT_TASK_DEFINITION: taskDefinition, IMPORT_TASK_CONTAINER: container = "import" } = env;
  if (!cluster) return null;
  if (!taskDefinition) throw new Error("IMPORT_TASK_CLUSTER is set but IMPORT_TASK_DEFINITION is not");
  const subnets = list(env.IMPORT_TASK_SUBNETS);
  if (subnets.length === 0) throw new Error("IMPORT_TASK_CLUSTER is set but IMPORT_TASK_SUBNETS is not");
  return ecsImportTasks(client ?? new ECSClient({}), { cluster, taskDefinition, container, subnets, securityGroups: list(env.IMPORT_TASK_SECURITY_GROUPS) });
};
