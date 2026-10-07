#!/usr/bin/env bash
set -u
LEAF=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/helper-auto-audit/reaudit-job
LANE=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job
LABEL=${1:?check label required}
WAIT_PID=${2:-}
export PATH=/home/rudi/.local/share/mise/installs/node/24.21.0/bin:/home/rudi/.local/share/mise/installs/gh/latest/gh_2.101.0_linux_amd64/bin:$PATH
export AKROGON_BASE=4e929fca0a8c793f2189454091fb5c0fcf74a1da
cd "$LANE" || exit 2
exec > "$LEAF/implementation/evidence/$LABEL.log" 2>&1
printf 'Started %s\n' "$(date -u +%FT%TZ)"
if [ -n "$WAIT_PID" ]; then
  printf 'Waiting for pre-existing native test PID %s before sequential lane verification\n' "$WAIT_PID"
  while kill -0 "$WAIT_PID" 2>/dev/null; do sleep 10; done
fi
exec 9> "$LEAF/implementation/native-check.lock"
flock 9
printf 'Check head %s\n' "$(git rev-parse HEAD)"
bun run build:plugin
BUILD=$?
if [ "$BUILD" -eq 0 ]; then
  bun --env-file=.env -e 'const p = Bun.spawn(["bash", "-c", ": \"${AKROGON_BASE:?AKROGON_BASE is required}\" && bun test"], {env: process.env, stdout: "inherit", stderr: "inherit"}); process.exit(await p.exited)'
  RESULT=$?
else
  RESULT=$BUILD
fi
printf '\nResult exit=%s at %s\n' "$RESULT" "$(date -u +%FT%TZ)"
printf '%s\n' "$RESULT" > "$LEAF/implementation/evidence/$LABEL.exit"
exit "$RESULT"
