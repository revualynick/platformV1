#!/usr/bin/env bash
# Deploy a committed revision of Revualy to staging on the Linux box.
#   scripts/staging/deploy.sh            # deploys HEAD
#   scripts/staging/deploy.sh <commit>   # deploys that commit
# Only committed code goes: uncommitted changes are never deployed, so
# staging always matches something in git history. Nothing here touches
# Railway or GitHub. See docs/staging.md.
set -euo pipefail
HOST="${STAGING_HOST:-nick@linuxbox.local}"
cd "$(git rev-parse --show-toplevel)"
REF="${1:-HEAD}"
SHA="$(git rev-parse --short=12 "$REF")"
if [ "$REF" = "HEAD" ] && [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "Note: you have uncommitted changes; deploying the last commit ($SHA) without them."
fi
REL="revualy-staging/releases/$SHA"
echo "Deploying $SHA to $HOST"
git archive --format=tar "$SHA" | ssh "$HOST" "set -e; rm -rf ~/$REL; mkdir -p ~/$REL; tar -x -C ~/$REL"
ssh "$HOST" "bash ~/$REL/scripts/staging/box-deploy.sh ~/$REL"
