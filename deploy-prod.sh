#!/usr/bin/env bash
#
# Safe production deploy for HormoneHealthAI on Cloud Run.
#
# What this does, in order:
#   1. Sanity checks: clean git tree, on main, gcloud authenticated
#   2. Pull latest main from origin
#   3. Snapshot the currently-serving Cloud Run revision (for rollback)
#   4. Run schema migration against the production database
#      (drizzle-kit refuses on data-loss; pass FORCE_PUSH=1 only after review)
#   5. Build & deploy a new Cloud Run revision WITH ZERO TRAFFIC
#      (live users keep hitting the old, working revision)
#   6. Smoke-test the new revision via its private tagged URL —
#      checks both /api/health (process up) and /api/ready (DB reachable)
#   7. Promote the new revision to 100% traffic only if smoke test passes
#   8. Print the rollback command pointing at the prior revision
#
# IMPORTANT — migration ordering caveat:
#   Step 4 migrates the schema while the OLD revision is still serving
#   live traffic. This is safe for additive changes (new columns, new
#   tables — what 95%+ of feature work produces). It is NOT safe for
#   destructive changes (column drops, renames, type changes), because
#   the old code may break against the new schema before the new
#   revision is promoted. Drizzle blocks destructive changes by default
#   and requires FORCE_PUSH=1 to override — if you find yourself
#   reaching for FORCE_PUSH, do the deploy in two steps instead:
#     (a) deploy code that tolerates BOTH old and new schema
#     (b) run the destructive migration manually
#     (c) deploy code that only tolerates the new schema
#
# Usage:
#   ./deploy-prod.sh                  # normal safe deploy
#   FORCE_PUSH=1 ./deploy-prod.sh     # allow drizzle to push schema changes
#                                     # that would drop a column or table
#                                     # (review the diff first!)
#
# Manual rollback at any time (the script prints this command at the end):
#   gcloud run services update-traffic hormonehealthai \
#     --region us-central1 --to-revisions=<PREVIOUS_REVISION>=100

set -euo pipefail

SERVICE=hormonehealthai
REGION=us-central1
PROJECT=realign-lab-app

cyan()  { printf '\033[1;36m%s\033[0m\n' "$*"; }
green() { printf '\033[1;32m%s\033[0m\n' "$*"; }
red()   { printf '\033[1;31m%s\033[0m\n' "$*" >&2; }

# ─── 1. Pre-flight checks ────────────────────────────────────────────────
cyan "==> Pre-flight checks"

if [ "$(git rev-parse --abbrev-ref HEAD)" != "main" ]; then
  red "ERROR: not on main branch. Switch to main before deploying."
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  red "ERROR: working tree is dirty. Commit or stash your changes first."
  exit 1
fi

gcloud config set project "$PROJECT" >/dev/null
if ! gcloud auth print-access-token >/dev/null 2>&1; then
  red "ERROR: gcloud not authenticated. Run: gcloud auth login"
  exit 1
fi

# ─── 2. Pull latest main ─────────────────────────────────────────────────
cyan "==> Pulling latest main from origin"
git pull --ff-only origin main
COMMIT=$(git rev-parse --short HEAD)
echo "    Deploying commit: $COMMIT"

# ─── 3. Snapshot current revision for rollback ──────────────────────────
cyan "==> Snapshotting currently-serving revision"
PREV_REVISION=$(gcloud run services describe "$SERVICE" \
  --region "$REGION" \
  --format='value(status.traffic[0].revisionName)')

if [ -z "$PREV_REVISION" ]; then
  red "ERROR: could not read current revision from Cloud Run"
  exit 1
fi

echo "    Currently live: $PREV_REVISION"
ROLLBACK_CMD="gcloud run services update-traffic $SERVICE --region $REGION --to-revisions=$PREV_REVISION=100"

# ─── 4. Run schema migration against production DB ──────────────────────
cyan "==> Extracting production DATABASE_URL from Cloud Run"
DB_URL=$(gcloud run services describe "$SERVICE" --region "$REGION" --format=json \
  | python3 -c "
import json, sys
for e in json.load(sys.stdin)['spec']['template']['spec']['containers'][0].get('env', []):
    if e.get('name') == 'DATABASE_URL':
        print(e.get('value', ''))
        break
")

if [ -z "$DB_URL" ]; then
  red "ERROR: DATABASE_URL not found on Cloud Run service env vars."
  red "       (If it's a Secret Manager reference, this script needs updating.)"
  exit 1
fi

cyan "==> Installing dependencies for migration step"
npm ci --silent

cyan "==> Migrating production schema (drizzle-kit push)"
echo "    Reading schema from shared/schema.ts and reconciling against prod DB."
echo "    Drizzle will refuse if it detects a column/table drop or rename."
echo ""

if [ "${FORCE_PUSH:-0}" = "1" ]; then
  red "    WARNING: FORCE_PUSH=1 — allowing destructive schema changes."
  DATABASE_URL="$DB_URL" npx drizzle-kit push --force
else
  DATABASE_URL="$DB_URL" npm run db:push
fi

green "    Schema migration complete."

# ─── 5. Build & deploy new revision with zero traffic ───────────────────
cyan "==> Building & deploying new revision (NO traffic — live users unaffected)"
TAG="rev$(date +%s)"

gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --no-traffic \
  --tag "$TAG"

NEW_URL=$(gcloud run services describe "$SERVICE" --region "$REGION" --format=json \
  | python3 -c "
import json, sys
data = json.load(sys.stdin)
for t in data['status'].get('traffic', []):
    if t.get('tag') == '$TAG':
        print(t.get('url', ''))
        break
")

if [ -z "$NEW_URL" ]; then
  red "ERROR: could not resolve tagged URL for new revision."
  red "       New revision was built but not promoted. Live traffic still on $PREV_REVISION."
  exit 1
fi

echo "    New revision available at (private tagged URL): $NEW_URL"

# ─── 6. Smoke-test the new revision ─────────────────────────────────────
# Two-stage check:
#   /api/health → confirms the Node process is up and Express is serving
#   /api/ready  → confirms the new revision can talk to the production DB
#                 (does a SELECT 1 against the pool with a 3s timeout)
# Both must return 200 before we promote traffic. If /api/ready fails,
# it usually means the migration in step 4 left the schema in a state
# the new code can't handle, OR a required env var is missing on the
# new revision — both conditions where the OLD revision is the right
# place for users to stay.
cyan "==> Smoke-testing new revision (/api/health + /api/ready)"
SMOKE_OK=0
for i in 1 2 3 4 5 6 7 8; do
  HEALTH=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$NEW_URL/api/health" || echo "000")
  READY=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$NEW_URL/api/ready"  || echo "000")
  if [ "$HEALTH" = "200" ] && [ "$READY" = "200" ]; then
    green "    Both checks passed on attempt $i (health=$HEALTH ready=$READY)"
    SMOKE_OK=1
    break
  fi
  echo "    Attempt $i: health=$HEALTH ready=$READY — retrying in 4s…"
  sleep 4
done

if [ "$SMOKE_OK" != "1" ]; then
  red "ERROR: smoke test failed after 8 attempts (health=$HEALTH ready=$READY)."
  red "       Live traffic is still on $PREV_REVISION — no users impacted."
  red "       Diagnostic body from /api/ready (often shows the underlying error):"
  curl -s --max-time 10 "$NEW_URL/api/ready" | head -c 500 || true
  echo ""
  red "       Full revision logs:"
  red "         gcloud run services logs read $SERVICE --region $REGION --limit 100"
  red "       GCP Console:"
  red "         https://console.cloud.google.com/run/detail/$REGION/$SERVICE/revisions?project=$PROJECT"
  exit 1
fi

# ─── 7. Promote to 100% traffic ─────────────────────────────────────────
cyan "==> Promoting new revision to 100% traffic"
gcloud run services update-traffic "$SERVICE" --region "$REGION" --to-latest

# ─── 8. Done — print rollback hint ──────────────────────────────────────
echo ""
green "==> Deploy complete"
echo "    Live commit:        $COMMIT"
echo "    Previous revision:  $PREV_REVISION"
echo ""
echo "    If something looks wrong in the next few minutes, roll back instantly with:"
echo "      $ROLLBACK_CMD"
echo ""
