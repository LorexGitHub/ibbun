// The one stack for ibbun on AWS (ADR 0015, ADR 0017). `alchemy dev` brings it up on Alchemy's
// local emulator with Compose's Postgres in place of Aurora. Nothing here has been deployed.
// docs/infrastructure.md says what runs, what the emulator cannot run, and what is untested.
import { createHash } from "node:crypto";
import * as AWS from "@alchemy.run/aws";
import * as Alchemy from "alchemy";
import * as Output from "alchemy/Output";
import { Stack } from "alchemy/Stack";
import * as Config from "effect/Config";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import { functionBuild, workerBuild } from "./scripts/infra/bundle.mjs";
import { eventBridgeCron } from "./scripts/infra/cron.ts";
import { scheduledJobs } from "./scripts/infra/schedules.mjs";
import { stageParts, stageSlug } from "./scripts/infra/stage.ts";

type Statement = AWS.IAM.PolicyStatement;

/** An Allow statement. Resource ARNs are often outputs of other resources, which Alchemy resolves when it deploys. */
const allow = (Action: string[], Resource: unknown[], Condition?: unknown): Statement => ({ Effect: "Allow", Action, Resource, ...(Condition ? { Condition } : {}) }) as unknown as Statement;

const BUDGET_USD = "10";
const DATABASE_NAME = "ibbun";
const APP_ROLE = "ibbun_app";
const OWNER_ROLE = "ibbun";
// Aurora pauses after 5 idle minutes (ADR 0015).
const AURORA_PAUSE_SECONDS = 300;
const AURORA_MAX_ACU = 2;
// apps/worker/src/lambda-config.ts: the numbers the worker Lambda and its queue share.
const WORKER = { timeoutSeconds: 900, reservedConcurrency: 5, batchSize: 1 } as const;
const QUEUE_VISIBILITY_SECONDS = 6 * WORKER.timeoutSeconds;
const WORKER_DOCKERFILE = "docker/worker-lambda/Dockerfile";
// The Supervisor picks 4 to 6 VOICEVOX voices, with a male and a female one (listening.md#voices). This is the local default.
const DEV_VOICES = JSON.stringify([
  { id: 11, character: "玄野武宏", speaker: "男" },
  { id: 13, character: "青山龍星", speaker: "男" },
  { id: 8, character: "春日部つむぎ", speaker: "女" },
  { id: 14, character: "冥鳴ひまり", speaker: "女" },
]);

// The emulator's CloudFront only proxies to localhost:<port> origins, not to the
// <id>.lambda-url.<region>.localhost hostnames it gives functions. It also serves each function at
// localhost:4566/lambda-url/<id>/, where <id> is a name-based UUID of account, region and function
// name. The router's rewrite is a fixed string, so the id is derived here.
const localFunctionUrlId = (region: string, functionName: string) => {
  const b = createHash("md5").update(`000000000000${region}${functionName}`).digest();
  b[6] = (b[6]! & 0x0f) | 0x30;
  b[8] = (b[8]! & 0x3f) | 0x80;
  return b.toString("hex");
};

// Aurora's settings (ADR 0015). Constants, not code in the stack's functions, so there is nothing for a mutation test to reach.
const AURORA_CLUSTER = {
  engine: "aurora-postgresql",
  engineVersion: "17.5",
  databaseName: DATABASE_NAME,
  enableIAMDatabaseAuthentication: true,
  storageEncrypted: true,
  masterUsername: OWNER_ROLE,
  manageMasterUserPassword: true,
  serverlessV2ScalingConfiguration: { MinCapacity: 0, MaxCapacity: AURORA_MAX_ACU, SecondsUntilAutoPause: AURORA_PAUSE_SECONDS },
  backupRetentionPeriod: Duration.days(7),
};
const AURORA_WRITER = { dbInstanceClass: "db.serverless", engine: AURORA_CLUSTER.engine, engineVersion: AURORA_CLUSTER.engineVersion, publiclyAccessible: true };

// The import container runs the import task's entry point, not the image's own (which starts Lambda's runtime emulator).
const IMPORT_CONTAINER = { name: "import", essential: true, entryPoint: ["node"], command: ["slices/import/server/import-task.ts"] };

/** `import.jmdict` becomes `ImportJmdict`: a resource id. */
const pascal = (jobName: string) => jobName.replace(/(^|[^a-z0-9]+)([a-z0-9])/gi, (_, __, c: string) => c.toUpperCase());

/** A VPC of public subnets only (ADR 0015): nothing in it needs a NAT gateway, because nothing private lives there. */
const publicNetwork = Effect.gen(function* () {
  const { region } = yield* AWS.AWSEnvironment.current;
  const vpc = yield* AWS.EC2.Vpc("Vpc", { cidrBlock: "10.0.0.0/16", enableDnsSupport: true, enableDnsHostnames: true });
  const gateway = yield* AWS.EC2.InternetGateway("Gateway", { vpcId: vpc.vpcId });
  const routes = yield* AWS.EC2.RouteTable("PublicRoutes", { vpcId: vpc.vpcId });
  const internet = yield* AWS.EC2.Route("PublicInternet", { routeTableId: routes.routeTableId, destinationCidrBlock: "0.0.0.0/0", gatewayId: gateway.internetGatewayId });
  // Aurora's subnet group needs two zones.
  const subnets = yield* Effect.forEach(["a", "b"], (zone, index) =>
    Effect.gen(function* () {
      const subnet = yield* AWS.EC2.Subnet(`PublicSubnet${zone.toUpperCase()}`, {
        vpcId: vpc.vpcId,
        cidrBlock: `10.0.${index}.0/24`,
        availabilityZone: `${region}${zone}`,
        mapPublicIpOnLaunch: true,
      });
      const association = yield* AWS.EC2.RouteTableAssociation(`PublicAssociation${zone.toUpperCase()}`, { routeTableId: routes.routeTableId, subnetId: subnet.subnetId });
      // A subnet is public once its association and the internet route exist: later resources wait for both.
      return Output.all(subnet.subnetId, association.associationId, internet.routeTableId).pipe(Output.map(([id]) => id));
    }),
  );
  return { vpc, subnets };
});

type Network = { vpc: { vpcId: any }; subnets: any[] };

/**
 * Aurora Serverless v2 for PostgreSQL, publicly reachable over TLS only (`rds.force_ssl`), with IAM
 * database authentication and auto-pause (ADR 0015). The master user is the migration owner; its
 * password is RDS-managed in Secrets Manager. The app connects as `ibbun_app` with IAM tokens.
 */
const aurora = (network: Network) =>
  Effect.gen(function* () {
    const { region, accountId } = yield* AWS.AWSEnvironment.current;
    const firewall = yield* AWS.EC2.SecurityGroup("DatabaseFirewall", {
      vpcId: network.vpc.vpcId,
      description: "Aurora over TLS with IAM tokens from anywhere: the Lambdas are not in a VPC (ADR 0015)",
      ingress: [{ ipProtocol: "tcp", fromPort: 5432, toPort: 5432, cidrIpv4: "0.0.0.0/0" }],
    });
    const subnetGroup = yield* AWS.RDS.DBSubnetGroup("DatabaseSubnets", { subnetIds: network.subnets, description: "Public subnets for Aurora" });
    // The cluster parameter group resource has no `parameters`, so CloudFormation's schema sets rds.force_ssl.
    const parameters = yield* AWS.CloudControl.Resource("DatabaseParameters", {
      typeName: "AWS::RDS::DBClusterParameterGroup",
      desiredState: {
        DBClusterParameterGroupName: "ibbun-force-ssl",
        Description: "TLS only (ADR 0015)",
        Family: "aurora-postgresql17",
        Parameters: { "rds.force_ssl": "1" },
      },
    });
    const cluster = yield* AWS.RDS.DBCluster("Database", {
      ...AURORA_CLUSTER,
      dbSubnetGroupName: subnetGroup.dbSubnetGroupName,
      dbClusterParameterGroupName: parameters.identifier as unknown as string,
      vpcSecurityGroupIds: [firewall.groupId] as any,
    });
    yield* AWS.RDS.DBInstance("DatabaseWriter", {
      ...AURORA_WRITER,
      dbClusterIdentifier: cluster.dbClusterIdentifier,
      dbSubnetGroupName: subnetGroup.dbSubnetGroupName,
    });
    return {
      url: Output.interpolate`postgres://${APP_ROLE}@${cluster.endpoint}:5432/${DATABASE_NAME}` as unknown,
      env: { DATABASE_IAM_REGION: region } as Record<string, string>,
      connect: [allow(["rds-db:connect"], [Output.interpolate`arn:aws:rds-db:${region}:${accountId}:dbuser:${cluster.dbClusterResourceId}/${APP_ROLE}`])],
    };
  });

const jobQueue = (prefix: string) =>
  Effect.gen(function* () {
    const dead = yield* AWS.SQS.Queue("JobsDeadLetters", { queueName: `${prefix}-dead-letters` });
    const queue = yield* AWS.SQS.Queue("Jobs", {
      queueName: prefix,
      // Six times the worker's timeout, as AWS advises for an SQS trigger.
      visibilityTimeout: Duration.seconds(QUEUE_VISIBILITY_SECONDS),
      redrivePolicy: { deadLetterTargetArn: dead.queueArn, maxReceiveCount: 3 },
    });
    return { queue, dead };
  });

type Database = { url: unknown; env: Record<string, string>; connect: Statement[] };

export default Alchemy.Stack(
  "ibbun",
  { providers: AWS.providers(), state: Alchemy.localState() },
  Effect.gen(function* () {
    const local = yield* AWS.isLocalEmulator;
    const { region, accountId } = yield* AWS.AWSEnvironment.current;
    const { stage } = yield* Stack;
    const parts = stageParts(stage);
    const slug = stageSlug(stage);
    const name = (what: string) => `ibbun-${slug}-${what}`;
    // Lambda runs the host's architecture in the emulator. On AWS the API and worker run on arm64
    // (ADR 0015), and the VOICEVOX image only exists for x86_64.
    const architecture = local ? "x86_64" : "arm64";
    const ssmPath = `/ibbun/${slug}`;
    // Compose's Postgres and Mailpit run on the host. The emulator runs Lambda in Docker, which reaches the host by this name.
    const host = "host.docker.internal";

    // ---- Buckets: the audio the worker writes, the content the Supervisor exports, raw import files.
    const audio = yield* AWS.S3.Bucket("Audio", { forceDestroy: true });
    const content = yield* AWS.S3.Bucket("Content", { forceDestroy: true });
    const importRaw = parts.worker ? yield* AWS.S3.Bucket("ImportRaw", { forceDestroy: true }) : undefined;

    // ---- The database. On AWS, Aurora Serverless v2 in a VPC of public subnets. Locally, Compose's
    // Postgres, which the emulator's RDS (SQLite behind the Postgres wire protocol) cannot replace.
    const network: Network = yield* publicNetwork;
    const database: Database = local
      ? {
          url: `postgres://${APP_ROLE}:${APP_ROLE}@${host}:${process.env.POSTGRES_PORT ?? "5432"}/${DATABASE_NAME}`,
          env: {},
          connect: [],
        }
      : yield* aurora(network);

    // ---- SSM Parameter Store. APP_URL lives here, not in the functions' environment, because the
    // router's URL needs the API's function URL: a cycle through the environment, none through SSM.
    const secrets: Record<string, string> = {
      AUTH_SECRET: local ? "dev-only-secret-not-for-production-use-0123456789" : yield* Config.String("IBBUN_AUTH_SECRET"),
    };
    if (parts.worker) secrets.ANTHROPIC_API_KEY = local ? "sk-local-stub" : yield* Config.String("IBBUN_ANTHROPIC_API_KEY");
    for (const [key, value] of Object.entries(secrets)) {
      yield* AWS.SSM.Parameter(`Secret${key}`, { name: `${ssmPath}/${key}`, type: "SecureString", value });
    }
    const ssmRead: Statement[] = [
      { Effect: "Allow", Action: ["ssm:GetParametersByPath", "ssm:GetParameters", "ssm:GetParameter"], Resource: [`arn:aws:ssm:${region}:${accountId}:parameter${ssmPath}*`] },
      { Effect: "Allow", Action: ["kms:Decrypt"], Resource: ["*"], Condition: { StringEquals: { "kms:ViaService": `ssm.${region}.amazonaws.com` } } },
    ];

    // ---- Jobs: one queue and its dead-letter queue.
    const jobs = parts.queue ? yield* jobQueue(name("jobs")) : undefined;
    const queueSend: Statement[] = jobs ? [allow(["sqs:SendMessage"], [jobs.queue.queueArn])] : [];

    // ---- Mail: SES on AWS, Mailpit in Compose when local.
    const mailFrom = process.env.MAIL_FROM ?? "ibbun <no-reply@ibbun.example>";
    const mailEnv: Record<string, string> = local
      ? { MAIL_TRANSPORT: "smtp", SMTP_URL: `smtp://${host}:${process.env.MAILPIT_SMTP_PORT ?? "1025"}`, MAIL_FROM: mailFrom }
      : { MAIL_TRANSPORT: "ses", MAIL_FROM: mailFrom };
    const mailSend: Statement[] = parts.mail && !local ? [{ Effect: "Allow", Action: ["ses:SendEmail", "ses:SendRawEmail"], Resource: ["*"] }] : [];
    if (parts.mail && !local) yield* AWS.SES.EmailIdentity("MailIdentity", { emailIdentity: yield* Config.String("IBBUN_MAIL_DOMAIN"), dkimSigningEnabled: true });

    // ---- The API: Hono behind CloudFront, bundled by Alchemy.
    const apiName = name("api");
    const api = yield* AWS.Lambda.Function("Api", {
      main: "./apps/api/src/lambda.ts",
      handler: "handler",
      build: functionBuild,
      runtime: "nodejs24.x",
      architecture,
      functionName: apiName,
      memorySize: 512,
      // A request after Aurora paused waits about 15 s for it to resume (ADR 0015).
      timeout: Duration.seconds(30),
      functionUrl: true,
      logging: { retention: "2 weeks" },
      env: {
        NODE_ENV: "production",
        SSM_PARAMETER_PATH: ssmPath,
        DATABASE_URL: database.url,
        DATABASE_POOL_MAX: "2",
        ...database.env,
        ...mailEnv,
        ...(jobs ? { JOBS_QUEUE_URL: jobs.queue.queueUrl } : {}),
        ...(parts.showcase ? { SHOWCASE: "1" } : {}),
      },
    });
    yield* api.bind`ApiPolicy`({ policyStatements: [...ssmRead, ...database.connect, ...queueSend, ...mailSend] });

    // ---- The front door: the web app by default, /api/* to the API, /audio/* to the audio bucket.
    const router = yield* AWS.Website.Router("Edge", {
      routes: {
        "/api/*": local
          ? { url: "http://localhost:4566", rewrite: { regex: "^/", to: `/lambda-url/${localFunctionUrlId(region, apiName)}/` } }
          : { url: Output.map(api.functionUrl, (url) => url!) },
        "/audio/*": { bucket: audio },
        "/content/*": { bucket: content },
      },
      invalidation: { paths: "all" },
    });
    yield* AWS.Website.StaticSite("WebApp", { path: "./apps/web/dist", spa: true, domain: { router }, forceDestroy: true });
    yield* AWS.SSM.Parameter("AppUrl", { name: `${ssmPath}/APP_URL`, type: "String", value: router.url as unknown as string });

    // ---- Everything a Learner's own request does not need: the worker, Sudachi, VOICEVOX, imports.
    if (parts.worker && jobs && importRaw) {
      // Sudachi and VOICEVOX run as container-image functions on AWS. Under the emulator the worker calls
      // the Compose containers instead, unless IBBUN_EMULATE_IMAGES=1 asks for the images (docs/infrastructure.md).
      const emulateImages = !local || process.env.IBBUN_EMULATE_IMAGES === "1";
      const containers = parts.containers && emulateImages ? yield* containerFunctions(name, local ? "NONE" : "AWS_IAM", local ? "x86_64" : "arm64") : undefined;
      const sudachiUrl = containers ? containers.sudachi.functionUrl : `http://${host}:8000`;
      const voicevoxUrl = containers ? containers.voicevox.functionUrl : `http://${host}:50021`;
      const invokeContainers: Statement[] = containers
        ? [allow(["lambda:InvokeFunctionUrl"], [containers.sudachi.functionArn, containers.voicevox.functionArn])]
        : [];
      const rawDir = Output.interpolate`s3://${importRaw.bucketName}/import-raw/`;
      const audioDir = Output.interpolate`s3://${audio.bucketName}/audio/`;
      const s3Statements: Statement[] = [
        allow(["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], [Output.interpolate`${audio.bucketArn}/audio/*`, Output.interpolate`${importRaw.bucketArn}/import-raw/*`]),
        allow(["s3:ListBucket"], [audio.bucketArn, importRaw.bucketArn]),
      ];

      const importEnv: Record<string, any> = {};
      const importPolicy: Statement[] = [];
      // The emulator's ECR registry cannot be reached by Docker Desktop on Windows, so no image runs there (docs/infrastructure.md).
      if (parts.importTask && !local) {
        const imports = yield* importTask({ name, network, database, ssmRead, env: { SUDACHI_URL: sudachiUrl, IMPORT_RAW_DIR: rawDir, AUDIO_DIR: audioDir }, s3Statements, invokeContainers });
        Object.assign(importEnv, imports.env);
        importPolicy.push(...imports.launch);
      }

      // On AWS the worker is the container image (docker/worker-lambda). The emulator cannot take an image push from
      // Docker Desktop on Windows, so locally the same handler (apps/worker/src/lambda.ts) is bundled like the API.
      const workerCode = local
        ? ({ main: "./apps/worker/src/lambda.ts", handler: "handler", build: workerBuild, runtime: "nodejs24.x" } as const)
        : ({ image: { context: ".", dockerfile: WORKER_DOCKERFILE } } as const);
      const workerFunction = yield* AWS.Lambda.Function("Worker", {
        ...workerCode,
        architecture,
        functionName: name("worker"),
        memorySize: 1769,
        timeout: Duration.seconds(WORKER.timeoutSeconds),
        reservedConcurrentExecutions: WORKER.reservedConcurrency,
        functionUrl: false,
        logging: { retention: "2 weeks" },
        env: {
          SSM_PARAMETER_PATH: ssmPath,
          DATABASE_URL: database.url,
          ...database.env,
          ...mailEnv,
          JOBS_QUEUE_URL: jobs.queue.queueUrl,
          SUDACHI_URL: sudachiUrl,
          VOICEVOX_URL: voicevoxUrl,
          AUDIO_DIR: audioDir,
          IMPORT_RAW_DIR: rawDir,
          VOICE_ALLOW_LIST: local ? DEV_VOICES : yield* Config.String("IBBUN_VOICE_ALLOW_LIST"),
          ...(local ? { ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL ?? `http://${host}:8787` } : {}),
          ...importEnv,
        },
      });
      yield* workerFunction.bind`WorkerPolicy`({
        policyStatements: [
          ...ssmRead,
          ...database.connect,
          ...queueSend,
          ...mailSend,
          ...s3Statements,
          ...invokeContainers,
          ...importPolicy,
          allow(["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes", "sqs:ChangeMessageVisibility"], [jobs.queue.queueArn]),
        ],
      });
      // maximumConcurrency 5 beside reserved concurrency 5: otherwise Lambda's SQS pollers get throttled and burn receives toward the dead-letter count.
      yield* AWS.Lambda.EventSourceMapping("WorkerTrigger", {
        functionName: workerFunction.functionName,
        eventSourceArn: jobs.queue.queueArn,
        batchSize: WORKER.batchSize,
        functionResponseTypes: ["ReportBatchItemFailures"],
        scalingConfig: { MaximumConcurrency: WORKER.reservedConcurrency },
      });

      // ---- Scheduler: each handler's own schedule becomes an entry that sends the job to the queue.
      if (parts.schedules) {
        const scheduler = yield* AWS.IAM.Role("SchedulerRole", {
          assumeRolePolicyDocument: { Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { Service: "scheduler.amazonaws.com" }, Action: ["sts:AssumeRole"] }] },
          inlinePolicies: { SendJobs: { Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: ["sqs:SendMessage"], Resource: [jobs.queue.queueArn] }] } },
        });
        for (const job of yield* Effect.promise(scheduledJobs)) {
          yield* AWS.Scheduler.Schedule(`Schedule${pascal(job.name)}`, {
            name: name(`schedule-${job.name.replace(/[^a-z0-9]+/gi, "-")}`),
            scheduleExpression: eventBridgeCron(job.cron),
            scheduleExpressionTimezone: "UTC",
            flexibleTimeWindow: { Mode: "OFF" },
            target: { Arn: jobs.queue.queueArn, RoleArn: scheduler.roleArn, Input: JSON.stringify({ name: job.name, payload: job.payload }) },
          });
        }
      }
    }

    // ---- Alerts: a Budgets alert at $10 a month, and the dead-letter queue's depth.
    const alertEmail = local ? "alerts@example.com" : yield* Config.String("IBBUN_ALERT_EMAIL");
    // The emulator has no AWS Budgets, so the budget is declared only on AWS.
    if (!local) {
      yield* AWS.Budgets.Budget("MonthlyBudget", {
        budgetName: name("monthly"),
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: { amount: BUDGET_USD, unit: "USD" },
        notifications: [{ notificationType: "ACTUAL", comparisonOperator: "GREATER_THAN", threshold: 100, thresholdType: "PERCENTAGE", subscribers: [{ subscriptionType: "EMAIL", address: alertEmail }] }],
      });
    }
    if (jobs) {
      const alerts = yield* AWS.SNS.Topic("Alerts", { topicName: name("alerts") });
      yield* AWS.SNS.Subscription("AlertsEmail", { topicArn: alerts.topicArn, protocol: "email", endpoint: alertEmail });
      yield* AWS.CloudWatch.Alarm("DeadLetterDepth", {
        name: name("dead-letters"),
        Namespace: "AWS/SQS",
        MetricName: "ApproximateNumberOfMessagesVisible",
        Dimensions: [{ Name: "QueueName", Value: jobs.dead.queueName }],
        Statistic: "Maximum",
        Period: 300,
        EvaluationPeriods: 1,
        Threshold: 0,
        ComparisonOperator: "GreaterThanThreshold",
        TreatMissingData: "notBreaching",
        AlarmActions: [alerts.topicArn],
      });
    }

    return { url: router.url, api: api.functionUrl, audioBucket: audio.bucketName, contentBucket: content.bucketName, ...(jobs ? { jobsQueue: jobs.queue.queueUrl } : {}) };
  }),
);

/** Sudachi and VOICEVOX as Lambda container images. Only jobs call them, so function URLs with IAM auth suffice (ADR 0015). */
function containerFunctions(name: (what: string) => string, authType: "NONE" | "AWS_IAM", architecture: "x86_64" | "arm64") {
  return Effect.gen(function* () {
    const sudachi = yield* AWS.Lambda.Function("Sudachi", {
      image: { context: "docker/sudachi", dockerfile: "Dockerfile" },
      architecture,
      functionName: name("sudachi"),
      memorySize: 2048,
      timeout: Duration.seconds(60),
      functionUrl: { authType },
      logging: { retention: "2 weeks" },
    });
    // The engine image has no arm64 build, so this function is x86_64 on AWS too.
    const voicevox = yield* AWS.Lambda.Function("Voicevox", {
      image: { context: "docker/voicevox", dockerfile: "Dockerfile" },
      architecture: "x86_64",
      functionName: name("voicevox"),
      memorySize: 3008,
      timeout: Duration.seconds(120),
      functionUrl: { authType },
      logging: { retention: "2 weeks" },
    });
    return {
      sudachi: { functionUrl: Output.map(sudachi.functionUrl, (url) => url!), functionArn: sudachi.functionArn },
      voicevox: { functionUrl: Output.map(voicevox.functionUrl, (url) => url!), functionArn: voicevox.functionArn },
    };
  });
}

type ImportTaskInput = {
  name: (what: string) => string;
  network: Network;
  database: Database;
  ssmRead: Statement[];
  env: Record<string, any>;
  s3Statements: Statement[];
  invokeContainers: Statement[];
};

/** The Fargate task for the imports that outrun Lambda's 15 minutes (JMdict, Tatoeba), and what the worker needs to start it. */
function importTask(input: ImportTaskInput) {
  return Effect.gen(function* () {
    const { name, network, database } = input;
    const cluster = yield* AWS.ECS.Cluster("Imports", { clusterName: name("imports") });
    const image = yield* AWS.ECR.Image("ImportImage", { context: ".", dockerfile: WORKER_DOCKERFILE, platform: "linux/arm64" });
    const trust = { Version: "2012-10-17" as const, Statement: [{ Effect: "Allow" as const, Principal: { Service: "ecs-tasks.amazonaws.com" }, Action: ["sts:AssumeRole"] }] };
    const execution = yield* AWS.IAM.Role("ImportExecutionRole", {
      assumeRolePolicyDocument: trust,
      managedPolicyArns: ["arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"],
    });
    const taskRole = yield* AWS.IAM.Role("ImportTaskRole", {
      assumeRolePolicyDocument: trust,
      inlinePolicies: { Imports: { Version: "2012-10-17", Statement: [...database.connect, ...input.s3Statements, ...input.invokeContainers, ...input.ssmRead] } },
    });
    const definition = yield* AWS.ECS.TaskDefinition("ImportTask", {
      family: name("import"),
      cpu: 2048,
      memory: 4096,
      networkMode: "awsvpc",
      requiresCompatibilities: ["FARGATE"],
      runtimePlatform: { cpuArchitecture: "ARM64", operatingSystemFamily: "LINUX" },
      executionRoleArn: execution.roleArn,
      taskRoleArn: taskRole.roleArn,
      awslogs: { streamPrefix: "import" },
      containerDefinitions: [
        {
          ...IMPORT_CONTAINER,
          image: image.imageUri as unknown as string,
          // The dataset and release come with each RunTask.
          environment: Object.entries({ DATABASE_URL: database.url, ...database.env, ...input.env }).map(([key, value]) => ({ name: key, value: value as string })),
        },
      ],
    });
    const firewall = yield* AWS.EC2.SecurityGroup("ImportFirewall", { vpcId: network.vpc.vpcId, description: "Import tasks: outbound only" });
    return {
      env: {
        IMPORT_TASK_CLUSTER: cluster.clusterArn,
        IMPORT_TASK_DEFINITION: definition.taskDefinitionArn,
        IMPORT_TASK_CONTAINER: "import",
        IMPORT_TASK_SUBNETS: Output.all(...network.subnets).pipe(Output.map((ids) => (ids as string[]).join(","))),
        IMPORT_TASK_SECURITY_GROUPS: firewall.groupId,
      },
      launch: [
        allow(["ecs:RunTask", "ecs:ListTasks"], ["*"], { ArnEquals: { "ecs:cluster": cluster.clusterArn } }),
        allow(["iam:PassRole"], [execution.roleArn, taskRole.roleArn]),
      ],
    };
  });
}
