import { ListTasksCommand, RunTaskCommand } from "@aws-sdk/client-ecs";
import { describe, expect, it } from "vitest";
import { ecsImportTasks, importTasksFromEnv, taskRequestFromEnv } from "./tasks.ts";

const ecs = ({ running = [] as string[], failures = [] as { arn?: string; reason?: string }[] } = {}) => {
  const sent: unknown[] = [];
  const send = async (command: unknown) => {
    sent.push(command);
    if (command instanceof ListTasksCommand) return { taskArns: running };
    if (command instanceof RunTaskCommand) return { tasks: failures.length ? [] : [{ taskArn: "arn:task/1" }], failures };
    throw new Error("unexpected command");
  };
  return { sent, client: { send } as never };
};

const config = { cluster: "imports", taskDefinition: "import:3", container: "import", subnets: ["subnet-a", "subnet-b"], securityGroups: ["sg-1"] };

describe("Fargate import tasks", () => {
  it("runs one Fargate task in public subnets, tagged with the dataset, with the request in the container's environment", async () => {
    const { sent, client } = ecs();
    expect(await ecsImportTasks(client, config).start({ dataset: "tatoeba", release: true })).toBe("started");
    const run = sent.find((c) => c instanceof RunTaskCommand) as RunTaskCommand;
    expect(run.input).toEqual({
      cluster: "imports",
      taskDefinition: "import:3",
      launchType: "FARGATE",
      count: 1,
      startedBy: "import.tatoeba",
      networkConfiguration: { awsvpcConfiguration: { subnets: ["subnet-a", "subnet-b"], securityGroups: ["sg-1"], assignPublicIp: "ENABLED" } },
      overrides: {
        containerOverrides: [
          {
            name: "import",
            environment: [
              { name: "IMPORT_DATASET", value: "tatoeba" },
              { name: "IMPORT_RELEASE", value: "true" },
            ],
          },
        ],
      },
    });
  });

  it("starts nothing while a task for the dataset is still running, so a job SQS delivers twice imports once", async () => {
    const { sent, client } = ecs({ running: ["arn:task/0"] });
    expect(await ecsImportTasks(client, config).start({ dataset: "tatoeba", release: false })).toBe("already running");
    expect(sent).toHaveLength(1);
    expect((sent[0] as ListTasksCommand).input).toEqual({ cluster: "imports", startedBy: "import.tatoeba", desiredStatus: "RUNNING" });
  });

  it("fails the job when ECS reports a failure, so SQS delivers it again", async () => {
    const { client } = ecs({ failures: [{ reason: "RESOURCE:MEMORY" }] });
    await expect(ecsImportTasks(client, config).start({ dataset: "unidic", release: false })).rejects.toThrow("import.unidic: ECS did not start the task: task RESOURCE:MEMORY");
  });

  it("reads the task's request from its environment, and refuses a dataset it does not refresh", () => {
    expect(taskRequestFromEnv({ IMPORT_DATASET: "tatoeba" }, ["jmdict", "tatoeba"])).toEqual({ dataset: "tatoeba", release: false });
    expect(taskRequestFromEnv({ IMPORT_DATASET: "jmdict", IMPORT_RELEASE: "true" }, ["jmdict", "tatoeba"])).toEqual({ dataset: "jmdict", release: true });
    expect(() => taskRequestFromEnv({ IMPORT_DATASET: "unidic" }, ["jmdict", "tatoeba"])).toThrow();
    expect(() => taskRequestFromEnv({}, ["jmdict"])).toThrow();
  });

  it("has no launcher without a cluster, and names the missing setting when one is half configured", async () => {
    expect(importTasksFromEnv({})).toBeNull();
    expect(() => importTasksFromEnv({ IMPORT_TASK_CLUSTER: "imports", IMPORT_TASK_SUBNETS: "subnet-a" })).toThrow("IMPORT_TASK_DEFINITION is not");
    expect(() => importTasksFromEnv({ IMPORT_TASK_CLUSTER: "imports", IMPORT_TASK_DEFINITION: "import:3" })).toThrow("IMPORT_TASK_SUBNETS is not");
    const { sent, client } = ecs();
    const env = { IMPORT_TASK_CLUSTER: "imports", IMPORT_TASK_DEFINITION: "import:3", IMPORT_TASK_SUBNETS: "subnet-a,subnet-b", IMPORT_TASK_SECURITY_GROUPS: "sg-1" };
    await importTasksFromEnv(env, client)!.start({ dataset: "tatoeba", release: false });
    expect((sent[1] as RunTaskCommand).input).toMatchObject({ cluster: "imports", taskDefinition: "import:3", overrides: { containerOverrides: [{ name: "import" }] } });
    expect((sent[1] as RunTaskCommand).input.networkConfiguration?.awsvpcConfiguration).toMatchObject({ subnets: ["subnet-a", "subnet-b"], securityGroups: ["sg-1"] });
  });
});
