#!/usr/bin/env bash
# Runs one refresh the way the Fargate task does (#258): the worker Lambda image with its entry point
# replaced by node, at the task's 2 vCPU and 4 GB (CPUS and MEMORY override them, for example 1 and 1769m for Lambda's share), against the database in DATABASE_URL.
# Usage, from the repository root: bash slices/import/smoke/import-task.sh <dataset>
# DATABASE_URL and SUDACHI_URL must be reachable from a container (use host.docker.internal for the host).
set -euo pipefail
dataset=${1:?dataset, for example tatoeba}
image=${IMAGE:-ibbun-worker-lambda}
[ -n "${SKIP_BUILD:-}" ] || docker build -q -f docker/worker-lambda/Dockerfile -t "$image" . >/dev/null
MSYS_NO_PATHCONV=1 docker run --rm --cpus "${CPUS:-2}" --memory "${MEMORY:-4g}" --add-host host.docker.internal:host-gateway \
  --entrypoint node \
  -e DATABASE_URL="${DATABASE_URL:?}" -e SUDACHI_URL="${SUDACHI_URL:-http://host.docker.internal:8000}" \
  -e IMPORT_RAW_DIR=/tmp/import-raw -e IMPORT_DATASET="$dataset" -e IMPORT_RELEASE="${IMPORT_RELEASE:-false}" \
  "$image" slices/import/server/import-task.ts
