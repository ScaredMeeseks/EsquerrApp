#!/usr/bin/env bash
# Deploys Firestore/Storage rules and/or Cloud Functions from Cloud Shell — with guards.
#
# Why the paranoia: the Firebase CLI's remembered active project can override
# .firebaserc (it once wiped another project's rules from a different folder).
# The --project flag below makes that impossible.
#
# Usage (Cloud Shell):
#   cd ~/EsquerrApp && ./deploy.sh rules       # firestore + storage rules
#   cd ~/EsquerrApp && ./deploy.sh functions   # cloud functions
#   cd ~/EsquerrApp && ./deploy.sh all         # both
set -euo pipefail

EXPECTED_REPO="ScaredMeeseks/EsquerrApp"
PROJECT="esquerrapp"
TARGET="${1:-rules}"

# 1. Right repo?
remote=$(git remote get-url origin 2>/dev/null || echo "none")
if [[ "$remote" != *"$EXPECTED_REPO"* ]]; then
  echo "❌ Wrong folder: git remote is '$remote' (expected $EXPECTED_REPO)."
  echo "   Run: cd ~/EsquerrApp"
  exit 1
fi
echo "✔ Repo: $remote"

# 2. .firebaserc sanity
if ! grep -q "\"$PROJECT\"" .firebaserc 2>/dev/null; then
  echo "❌ .firebaserc missing or doesn't point to $PROJECT."
  exit 1
fi
echo "✔ .firebaserc → $PROJECT"

# 3. Latest code
git pull --ff-only

# 4. Pin the CLI's active project (for any manual firebase commands later)
firebase use "$PROJECT" >/dev/null
echo "✔ Firebase CLI pinned to $PROJECT"

# 5. Deploy — explicit --project so no remembered setting can override it.
#    Always read the "=== Deploying to '...'" header before confirming anything.
case "$TARGET" in
  rules)     firebase deploy --only firestore:rules,storage --project "$PROJECT" ;;
  functions) (cd functions && npm install) && firebase deploy --only functions --project "$PROJECT" ;;
  all)       (cd functions && npm install) && firebase deploy --only firestore:rules,storage,functions --project "$PROJECT" ;;
  *)         echo "Usage: ./deploy.sh [rules|functions|all]"; exit 1 ;;
esac
