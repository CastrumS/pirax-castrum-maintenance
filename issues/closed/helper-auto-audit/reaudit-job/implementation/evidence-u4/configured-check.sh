#!/usr/bin/env bash
# Unit 4 configured changed check: build, then the brief's exact command, serialized on the shared native lock.
set -u
L=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/helper-auto-audit/reaudit-job/implementation
E=$L/evidence-u4
export PATH=/home/rudi/.local/share/mise/installs/node/24.21.0/bin:/home/rudi/.local/share/mise/installs/gh/latest/gh_2.101.0_linux_amd64/bin:$PATH
cd /home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job-u4 || exit 2
exec > "$E/configured-check.log" 2>&1
printf 'Queued %s\n' "$(date -u +%FT%TZ)"
exec 9> "$L/native-check.lock"
flock 9
printf 'Lock acquired %s; head %s; gh %s; node %s\n' "$(date -u +%FT%TZ)" "$(git rev-parse HEAD)" "$(command -v gh)" "$(node --version)"
git status --short
bun run build:plugin
BUILD=$?
if [ "$BUILD" -eq 0 ]; then
  AKROGON_BASE=4e929fca0a8c793f2189454091fb5c0fcf74a1da bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env -e 'const p=Bun.spawn(["bash","-c",": \"${AKROGON_BASE:?AKROGON_BASE is required}\" && bun test"],{env:process.env,stdout:"inherit",stderr:"inherit"});process.exit(await p.exited)'
  RESULT=$?
else
  RESULT=$BUILD
fi
printf '\nResult exit=%s at %s\n' "$RESULT" "$(date -u +%FT%TZ)"
printf '%s\n' "$RESULT" > "$E/configured-check.exit"
exit "$RESULT"
