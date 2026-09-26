#!/usr/bin/env bash
# Copy this working tree to the eval workspace on the Linux box. Only files
# git tracks or would track are sent, never ignored ones (.env files, OAuth
# client secrets, local data). Deletions are not propagated.
set -euo pipefail
HOST="${QM_LINUX_HOST:-nick@linuxbox.local}"
DEST="${REVUALY_EVAL_WS:-agents/revualy-eval}"
cd "$(git rev-parse --show-toplevel)"
# Skip paths git still lists but that no longer exist (deleted, not yet committed).
git ls-files -co --exclude-standard -z \
  | python3 -c 'import os, sys; sys.stdout.write("".join(p + "\0" for p in sys.stdin.read().split("\0") if p and os.path.exists(p)))' \
  | rsync -az --from0 --files-from=- ./ "$HOST:$DEST/"
echo "synced to $HOST:$DEST"
