# The worker Lambda (ADR 0015): apps/worker's job handlers behind an SQS trigger.
# Build from the repository root: docker build -f docker/worker-lambda/Dockerfile .
FROM public.ecr.aws/lambda/nodejs:24
WORKDIR ${LAMBDA_TASK_ROOT}
RUN npm install -g corepack@latest && corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --prod && node scripts/gen-slice-index.mjs
CMD ["apps/worker/src/lambda-entry.handler"]
