// Monthly cost estimate for the serverless stack in docs/adr/0015-serverless-on-aws-with-neon.md.
// Usage: node scripts/cost-model.mjs [learners ...]
// AWS: eu-central-1 list prices from the AWS Price List API, fetched 2026-11-13; only the always-free
// allowances are applied. Neon: neon.com/pricing, Launch plan, read 2026-11-13. Claude: Anthropic list
// prices for claude-sonnet-5-5.

const price = {
  lambdaRequest: 0.2 / 1e6,
  lambdaGbSecondArm: 0.0000133334,
  sqsRequest: 0.4 / 1e6,
  sesRecipient: 0.0001,
  s3StorageGbMonth: 0.0245,
  s3Put: 0.0054 / 1e3,
  s3Get: 0.0043 / 1e4,
  cloudfrontGbOut: 0.085,
  cloudfrontRequest: 0.012 / 1e4,
  ecrGbMonth: 0.1,
  logsIngestGb: 0.63,
  fargateVcpuHour: 0.04656,
  fargateGbHour: 0.00511,
  neonCuHour: 0.106,
  neonStorageGbMonth: 0.35,
  neonRestoreGbMonth: 0.2,
  auroraAcuHour: 0.14,
  auroraStorageGbMonth: 0.119,
  auroraIo: 0.22 / 1e6,
  publicIpv4Hour: 0.005,
  claudeInput: 2 / 1e6,
  claudeOutput: 10 / 1e6,
};

const free = {
  lambdaRequests: 1e6,
  lambdaGbSeconds: 400_000,
  sqsRequests: 1e6,
  cloudfrontGb: 1024,
  cloudfrontRequests: 10e6,
  logsIngestGb: 5,
};

const HOURS = 730;

// One active Learner in one month.
const learner = {
  studyDays: 20,
  sessionsPerDay: 1.5,
  sessionMinutes: 20,
  apiCallsPerDay: 130, // 100 Reviews plus Learn, Today and the other screens
  batchTextsPerDay: 2, // ADR 0012 caps this at 5
  cdnMbOut: 15, // app shell plus Listening Clip audio
  cdnRequests: 600,
  emails: 1,
};

const api = { ms: 80, gb: 0.5 };
const batchText = { lambdaSeconds: 45, gb: 0.5, attempts: 1.3, inputTokens: 4000, outputTokens: 1500 };
const sudachi = { seconds: 1, gb: 1 };

// The other half of the daily token budget (ADR 0012) feeds content generation and review. The supervisor
// decides how much of it to use, so it is a separate line, not part of the per-Learner cost.
const tokenBudget = { perDay: 2_000_000, batchTextShare: 0.5 };

const platform = {
  dbGb: 1.6, // measured: the local database with the real N5–N1 content, 2026-11-13
  audioGb: 1,
  imagesGb: 2.5, // VOICEVOX and Sudachi images in ECR
  contentHours: 20, // hours a month the database is busy with imports and content generation
  importRuns: 4,
  importHours: 0.5, // one Fargate task, 2 vCPU and 4 GB
  clipsSynthesised: 500,
  clipSeconds: 4,
  clipGb: 3,
  idleQueuePolls: 650_000, // Lambda's long polling of one empty SQS queue, per queue
  queues: 1, // the dead-letter queue is not polled
  logBytesPerInvoke: 300,
};

// Neon and Aurora suspend after 5 idle minutes. Sessions arrive at random, so the share of the month with
// at least one session open is 1 - e^(-busy hours / month hours).
const activeHours = (learners) => {
  const sessionHours = learners * learner.studyDays * learner.sessionsPerDay * ((learner.sessionMinutes + 5) / 60);
  return HOURS * (1 - Math.exp(-(sessionHours + platform.contentHours) / HOURS));
};

const concurrentLearners = (learners) =>
  (learners * learner.studyDays * learner.sessionsPerDay * learner.sessionMinutes) / 60 / HOURS;

const over = (used, allowance) => Math.max(0, used - allowance);

const database = {
  // Real Postgres, scale to zero, public TLS endpoint with a pooler: no VPC and no NAT gateway.
  neon: (learners) => {
    const cu = Math.max(0.25, concurrentLearners(learners) * 0.01);
    return (
      activeHours(learners) * cu * price.neonCuHour +
      platform.dbGb * (price.neonStorageGbMonth + price.neonRestoreGbMonth)
    );
  },
  // Aurora Serverless v2 with auto-pause, publicly reachable so the Lambdas stay out of a VPC. An ACU is half a
  // Neon CU, and its public IPv4 address bills every hour, paused or not.
  aurora: (learners) => {
    const acu = Math.max(0.5, concurrentLearners(learners) * 0.02);
    const ios = learners * learner.studyDays * learner.apiCallsPerDay * 20;
    return (
      activeHours(learners) * acu * price.auroraAcuHour +
      platform.dbGb * price.auroraStorageGbMonth +
      ios * price.auroraIo +
      HOURS * price.publicIpv4Hour
    );
  },
};

function estimate(learners, db) {
  const days = learners * learner.studyDays;
  const apiCalls = days * learner.apiCallsPerDay;
  const batchTextCap =
    (tokenBudget.perDay * tokenBudget.batchTextShare * 30.4) /
    ((batchText.inputTokens + batchText.outputTokens) * batchText.attempts);
  const batchTexts = Math.min(days * learner.batchTextsPerDay, batchTextCap);
  const attempts = batchTexts * batchText.attempts;

  const invokes = apiCalls + attempts * 2 + platform.clipsSynthesised;
  const gbSeconds =
    apiCalls * (api.ms / 1000) * api.gb +
    attempts * (batchText.lambdaSeconds * batchText.gb + sudachi.seconds * sudachi.gb) +
    platform.clipsSynthesised * platform.clipSeconds * platform.clipGb;
  const cdnGb = (learners * learner.cdnMbOut) / 1024;
  const cdnRequests = apiCalls + learners * learner.cdnRequests;
  const sqsRequests = platform.queues * platform.idleQueuePolls + attempts * 3;
  const logsGb = (invokes * platform.logBytesPerInvoke) / 1e9;

  const aws = {
    Database: database[db](learners),
    Lambda: over(invokes, free.lambdaRequests) * price.lambdaRequest + over(gbSeconds, free.lambdaGbSeconds) * price.lambdaGbSecondArm,
    SQS: over(sqsRequests, free.sqsRequests) * price.sqsRequest,
    CloudFront: over(cdnGb, free.cloudfrontGb) * price.cloudfrontGbOut + over(cdnRequests, free.cloudfrontRequests) * price.cloudfrontRequest,
    S3: platform.audioGb * price.s3StorageGbMonth + platform.clipsSynthesised * price.s3Put + learners * learner.cdnRequests * price.s3Get,
    ECR: platform.imagesGb * price.ecrGbMonth,
    Fargate: platform.importRuns * platform.importHours * (2 * price.fargateVcpuHour + 4 * price.fargateGbHour),
    SES: learners * learner.emails * price.sesRecipient,
    "CloudWatch Logs": over(logsGb, free.logsIngestGb) * price.logsIngestGb,
  };
  const claude = attempts * (batchText.inputTokens * price.claudeInput + batchText.outputTokens * price.claudeOutput);
  const total = Object.values(aws).reduce((a, b) => a + b, 0);
  return { aws, total, claude, capped: days * learner.batchTextsPerDay > batchTextCap };
}

const contentBudgetTokens = tokenBudget.perDay * (1 - tokenBudget.batchTextShare) * 30.4;
const contentCeiling = contentBudgetTokens * (0.75 * price.claudeInput + 0.25 * price.claudeOutput);

const sizes = process.argv.slice(2).map(Number);
for (const db of ["neon", "aurora"]) {
  console.log(`\n${db === "neon" ? "Neon (Launch)" : "Aurora Serverless v2"}`);
  for (const n of sizes.length ? sizes : [0, 10, 100, 1_000, 10_000]) {
    const { aws, total, claude, capped } = estimate(n, db);
    const parts = Object.entries(aws)
      .filter(([, v]) => v >= 0.005)
      .map(([k, v]) => `${k} $${v.toFixed(2)}`)
      .join(", ");
    const llm = `Batch Texts $${claude.toFixed(2)}${capped ? " (budget cap)" : ""}`;
    console.log(`${String(n).padStart(6)} learners: AWS $${total.toFixed(2)}/month  [${parts}]  Claude: ${llm}`);
  }
}
console.log(`\nContent generation and review: up to $${contentCeiling.toFixed(0)}/month of Claude if the supervisor uses the whole other half of the budget.`);
