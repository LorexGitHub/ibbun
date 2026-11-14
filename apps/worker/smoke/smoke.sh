#!/usr/bin/env bash
# Runs one batch-text.generate job through ElasticMQ into the worker Lambda image under the
# Runtime Interface Emulator, with Claude stubbed at its HTTP boundary, and checks the Batch Text.
# Usage, from the repository root: bash apps/worker/smoke/smoke.sh
set -euo pipefail
net=ibbun-worker-smoke
cleanup() { docker rm -f smoke-pg smoke-mq smoke-lambda >/dev/null 2>&1 || true; docker network rm $net >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

docker build -q -f docker/worker-lambda/Dockerfile -t ibbun-worker-lambda . >/dev/null
docker network create $net >/dev/null
docker run -d --name smoke-pg --network $net -p 5757:5432 -e POSTGRES_USER=ibbun -e POSTGRES_PASSWORD=ibbun -e POSTGRES_DB=ibbun postgres:17 >/dev/null
root=$(pwd -W 2>/dev/null || pwd)
MSYS_NO_PATHCONV=1 docker run -d --name smoke-mq --network $net -p 9757:9324 -v "$root/docker/elasticmq/elasticmq.conf:/opt/elasticmq.conf:ro" softwaremill/elasticmq-native:1.6.14 >/dev/null
until docker exec smoke-pg pg_isready -U ibbun >/dev/null 2>&1; do sleep 1; done
sleep 2

export DATABASE_URL=postgres://ibbun:ibbun@localhost:5757/ibbun
pnpm -s db:migrate
pnpm -s --filter @ibbun/content-graph seed:fixture

docker run -d --name smoke-lambda --network $net -p 9758:8080 --add-host host.docker.internal:host-gateway \
  -e DATABASE_URL=postgres://ibbun:ibbun@smoke-pg:5432/ibbun \
  -e JOBS_QUEUE_URL=http://smoke-mq:9324/000000000000/ibbun-jobs \
  -e ANTHROPIC_API_KEY=stub -e ANTHROPIC_BASE_URL=http://host.docker.internal:9759 \
  ibbun-worker-lambda >/dev/null

QUEUE_URL=http://localhost:9757/000000000000/ibbun-jobs LAMBDA_URL=http://localhost:9758 CLAUDE_STUB_PORT=9759 \
  node apps/worker/smoke/smoke.ts
