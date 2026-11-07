// Monthly AWS cost estimate for the stack in alchemy.run.ts, eu-central-1 list prices.
// Usage: node scripts/cost-model.mjs [learners ...]
// Prices: AWS Price List API, fetched 2026-11-04. Free tiers: the always-free allowances only.

const price = {
  lambdaRequest: 0.2 / 1e6,
  lambdaGbSecond: 0.0000166667,
  ddbWriteUnit: 0.7625 / 1e6,
  ddbReadUnit: 0.1525 / 1e6,
  ddbStorageGbMonth: 0.306,
  ddbPitrGbMonth: 0.2448,
  s3StorageGbMonth: 0.0245,
  s3Get: 0.0043 / 1e4,
  cloudfrontGbOut: 0.085,
  cloudfrontRequest: 0.012 / 1e4,
  cloudfrontFunctionRun: 0.1 / 1e6,
  kvsEdgeRead: 0.03 / 1e6,
  logsIngestGb: 0.63,
  cognitoLiteMau: 0.0055,
};

const free = {
  lambdaRequests: 1e6,
  lambdaGbSeconds: 400_000,
  ddbStorageGb: 25,
  cloudfrontGb: 1024,
  cloudfrontRequests: 10e6,
  cloudfrontFunctionRuns: 2e6,
  kvsEdgeReads: 2e6,
  logsIngestGb: 5,
  cognitoMau: 10_000,
};

// One active Learner in one month.
const learner = {
  studyDays: 20,
  reviewsPerDay: 100,
  otherApiCallsPerDay: 5,
  itemsQueryReadUnits: 25, // ~200 KB of ITEM# rows, eventually consistent
  writeUnitsPerReview: 4, // transaction: 2 items x 2 units
  lambdaMs: 50,
  lambdaGb: 0.25,
  logBytesPerInvoke: 300,
  cdnMbOut: 15, // app shell + content bundles once + ~200 Listening Clips
  cdnAssetRequests: 500,
  storedBytesPerMonth: 2000 * 120, // Review rows accumulate
};

const contentGb = 0.6;
// Website.Router runs a viewer-request and a viewer-response function per request; each request
// reads the route table and one route's metadata from the KeyValueStore.
const routerFunctionRunsPerRequest = 2;
const routerKvsReadsPerRequest = 2; // bundles plus Listening Clip audio in S3

const over = (used, allowance) => Math.max(0, used - allowance);

function estimate(learners) {
  const days = learners * learner.studyDays;
  const reviews = days * learner.reviewsPerDay;
  const apiCalls = reviews + days * learner.otherApiCallsPerDay;
  const gbSeconds = apiCalls * (learner.lambdaMs / 1000) * learner.lambdaGb;
  const ddbGb = (learners * learner.storedBytesPerMonth * 12) / 1e9; // after a year of history
  const cdnGb = (learners * learner.cdnMbOut) / 1024;
  const cdnRequests = apiCalls + learners * learner.cdnAssetRequests;
  const logsGb = (apiCalls * learner.logBytesPerInvoke) / 1e9;

  const lines = {
    Lambda:
      over(apiCalls, free.lambdaRequests) * price.lambdaRequest +
      over(gbSeconds, free.lambdaGbSeconds) * price.lambdaGbSecond,
    DynamoDB:
      reviews * learner.writeUnitsPerReview * price.ddbWriteUnit +
      days * learner.otherApiCallsPerDay * learner.itemsQueryReadUnits * price.ddbReadUnit +
      over(ddbGb, free.ddbStorageGb) * price.ddbStorageGbMonth +
      ddbGb * price.ddbPitrGbMonth,
    CloudFront:
      over(cdnGb, free.cloudfrontGb) * price.cloudfrontGbOut +
      over(cdnRequests, free.cloudfrontRequests) * price.cloudfrontRequest +
      over(cdnRequests * routerFunctionRunsPerRequest, free.cloudfrontFunctionRuns) * price.cloudfrontFunctionRun +
      over(cdnRequests * routerKvsReadsPerRequest, free.kvsEdgeReads) * price.kvsEdgeRead,
    S3: contentGb * price.s3StorageGbMonth + learners * learner.cdnAssetRequests * price.s3Get,
    "CloudWatch Logs": over(logsGb, free.logsIngestGb) * price.logsIngestGb,
    Cognito: over(learners, free.cognitoMau) * price.cognitoLiteMau,
  };
  const total = Object.values(lines).reduce((a, b) => a + b, 0);
  return { learners, lines, total };
}

const sizes = process.argv.slice(2).map(Number);
for (const n of sizes.length ? sizes : [10, 100, 1_000, 10_000, 50_000]) {
  const { lines, total } = estimate(n);
  const parts = Object.entries(lines)
    .filter(([, v]) => v >= 0.005)
    .map(([k, v]) => `${k} $${v.toFixed(2)}`)
    .join(", ");
  console.log(`${String(n).padStart(6)} learners: $${total.toFixed(2)}/month  ${parts}`);
}
