#!/usr/bin/env bash
# Diamond frontend mirror — keep ~/repos/diamond an EXACT, current copy of
# origin/main (= what Vercel serves). READ-ONLY mirror; never commit there.
#
# This file is the CANONICAL, version-controlled source. Install on the box:
#   cp ~/repos/diamond/scripts/box/diamond-mirror-sync.sh ~/.diamond-mirror-sync.sh
#   chmod +x ~/.diamond-mirror-sync.sh
#   crontab -e   ->   */15 * * * * /home/<user>/.diamond-mirror-sync.sh
# Optional alerting: put an ntfy (or any webhook) URL in ~/.diamond-mirror-sync.ntfy
# and WARN/ERROR lines are POSTed there as well as logged.
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
set -uo pipefail

R="$HOME/repos/diamond"
LOG="$HOME/.diamond-mirror-sync.log"
LOCK="$HOME/.diamond-mirror-sync.lock"
NTFY_CFG="$HOME/.diamond-mirror-sync.ntfy"

ts() { date '+%Y-%m-%d %H:%M:%S'; }
# Log a line; on WARN/ERROR also alert via the optional ntfy/webhook URL.
note() {
  echo "$(ts) $1" >>"$LOG"
  case "$1" in
    WARN*|ERROR*)
      [ -s "$NTFY_CFG" ] && curl -fsS -m 10 -d "diamond-mirror: $1" "$(cat "$NTFY_CFG")" >/dev/null 2>&1 || true ;;
  esac
}

# Single-flight: never let a hung run pile up behind the next */15 tick.
exec 9>"$LOCK"
flock -n 9 || { note "WARN previous run still active - skipping this tick"; exit 0; }

cd "$R" 2>/dev/null || { note "ERROR repo missing: $R"; exit 1; }

# Must be on the 'main' branch (guards against a detached HEAD / stray checkout
# leaving the branch ref behind while HEAD silently advances).
[ "$(git symbolic-ref -q --short HEAD)" = "main" ] || { note "ERROR not on 'main' branch (detached?) - skipping"; exit 1; }

timeout 120 git fetch -q origin 2>>"$LOG" || { note "ERROR git fetch failed"; exit 1; }

# Drift-guard: never clobber local TRACKED edits or local commits. Untracked
# files (e.g. a future .env.local) are benign and don't block a fast-forward.
if [ -n "$(git status --porcelain --untracked-files=no)" ] || [ -n "$(git rev-list origin/main..HEAD 2>/dev/null)" ]; then
  note "WARN local changes/commits present - NOT syncing (manual review needed)"
  exit 0
fi

before=$(git rev-parse --short HEAD)
# Check the merge result explicitly — never infer success from "HEAD didn't move"
# (a failed FF also leaves HEAD unmoved, which would mislog as 'ok up-to-date').
if ! git merge --ff-only -q origin/main 2>>"$LOG"; then
  behind=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo '?')
  note "ERROR cannot fast-forward (history rewrite on main?) behind=$behind"
  exit 1
fi
after=$(git rev-parse --short HEAD)

if [ "$before" = "$after" ]; then
  echo "$(ts) ok up-to-date @ $after" >>"$LOG"
else
  echo "$(ts) synced $before -> $after" >>"$LOG"
fi
