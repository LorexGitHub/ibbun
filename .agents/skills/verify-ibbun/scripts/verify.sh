#!/usr/bin/env bash
# verify-ibbun helper. Usage: verify.sh up|doctor|down|shot <route> <name>
# Run from anywhere inside the repo. State and evidence live in target/verify/.
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
OUT=target/verify
RUN=$OUT/run
PROJECT=ibbun-verify
API_PORT=${API_PORT:-3000}
WEB=http://localhost:5173
export API_PORT DATABASE_URL=${DATABASE_URL:-postgres://ibbun:ibbun@localhost:5432/ibbun}
export JOBS_QUEUE_URL=${JOBS_QUEUE_URL:-http://localhost:9324/000000000000/ibbun-jobs}
# The account slice's auth config and the dev accounts the seed creates (accounts.md#testing).
export APP_URL=${APP_URL:-http://localhost:5173}
export AUTH_SECRET=${AUTH_SECRET:-verify-only-secret-0123456789abcdefghij}
export SEED_LEARNER_PASSWORD=${SEED_LEARNER_PASSWORD:-learner-password}
export SEED_SUPERVISOR_PASSWORD=${SEED_SUPERVISOR_PASSWORD:-supervisor-password}
compose() { docker compose -p "$PROJECT" "$@"; }

port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

wait_http() { # url seconds
  for _ in $(seq "$2"); do curl -fs "$1" >/dev/null 2>&1 && return 0; sleep 1; done
  echo "timeout waiting for $1" >&2; return 1
}

up() {
  [ -e "$RUN/api.pid" ] && { echo "a verify run is already up; run down first" >&2; exit 1; }
  for p in 5432 1025 8025 9324 "$API_PORT" 5173; do
    port_busy "$p" && { echo "port $p is in use by something this run did not start; stop it (or your dev stack) first" >&2; exit 1; }
  done
  mkdir -p "$RUN"
  compose up -d --wait postgres mailpit elasticmq
  pnpm install --frozen-lockfile >"$RUN/install.log" 2>&1
  pnpm gen >/dev/null
  pnpm db:migrate >"$RUN/migrate.log" 2>&1
  pnpm --filter @ibbun/learner seed >"$RUN/seed.log" 2>&1
  # The API runs as the app role, as on Aurora; migrations and seeds run as the owner above.
  DATABASE_URL=${APP_DATABASE_URL:-postgres://ibbun_app:ibbun_app@localhost:5432/ibbun} nohup pnpm --filter @ibbun/api start >"$RUN/api.log" 2>&1 & echo $! >"$RUN/api.pid"
  nohup pnpm --filter @ibbun/web dev --port 5173 --strictPort >"$RUN/web.log" 2>&1 & echo $! >"$RUN/web.pid"
  wait_http "http://localhost:$API_PORT/api/health" 60
  wait_http "$WEB/api/health" 60
  echo "ready: web $WEB  api http://localhost:$API_PORT  mail http://localhost:8025"
}

doctor() {
  local ok=0
  check() { if eval "$2" >/dev/null 2>&1; then echo "ok   $1"; else echo "FAIL $1"; ok=1; fi; }
  check "run started by verify.sh" "[ -e $RUN/api.pid ] && kill -0 \$(cat $RUN/api.pid) && kill -0 \$(cat $RUN/web.pid)"
  check "compose project $PROJECT has postgres healthy" "docker compose -p $PROJECT ps postgres --format '{{.Health}}' | grep -q healthy"
  check "mailpit inbox answers" "curl -fs http://localhost:8025/api/v1/info"
  check "api /api/health is {ok:true}" "curl -fs http://localhost:$API_PORT/api/health | grep -q '\"ok\":true'"
  check "web proxies /api to the api" "curl -fs $WEB/api/health | grep -q '\"ok\":true'"
  check "web serves the SPA" "curl -fs $WEB/ | grep -q 'id=\"root\"'"
  echo "commit $(git rev-parse --short HEAD) on $(git branch --show-current)"
  return $ok
}

down() {
  for f in "$RUN"/*.pid; do
    [ -e "$f" ] || continue
    pid=$(cat "$f"); pkill -TERM -P "$pid" 2>/dev/null || true; kill "$pid" 2>/dev/null || true; rm -f "$f"
  done
  compose down -v --remove-orphans
  echo "down; evidence kept in $OUT/evidence"
}

shot() { # route name
  node "$(dirname "$0")/shot.ts" "$WEB$1" "$OUT/evidence/$2"
}

case "${1:-}" in
  up) up ;; doctor) doctor ;; down) down ;; shot) shift; shot "$@" ;;
  *) echo "usage: verify.sh up|doctor|down|shot <route> <name>" >&2; exit 2 ;;
esac
