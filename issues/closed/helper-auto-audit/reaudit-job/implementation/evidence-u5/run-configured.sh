#!/bin/bash
set -u
cd /home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job-u5 || exit 1
export PATH=/home/rudi/.local/share/mise/installs/node/24.21.0/bin:/home/rudi/.local/share/mise/installs/gh/latest/gh_2.101.0_linux_amd64/bin:$PATH
export AKROGON_BASE=4e929fca0a8c793f2189454091fb5c0fcf74a1da
I=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/helper-auto-audit/reaudit-job/implementation
E=$I/evidence-u5
exec 9>"$I/native-check.lock"
printf 'Waiting for shared native lock at %s\n' "$(date -u +%FT%TZ)"
flock 9
printf 'Started at %s\n' "$(date -u +%FT%TZ)"
git rev-parse HEAD > "$E/configured-head-before"
git write-tree > "$E/configured-tree-before"
bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env "$E/run-configured.ts"
result=$?
printf '%s\n' "$result" > "$E/configured-check.exit"
git rev-parse HEAD > "$E/configured-head-after"
git write-tree > "$E/configured-tree-after"
git diff --exit-code > "$E/configured-unstaged.diff"
printf 'Result exit=%s at %s\n' "$result" "$(date -u +%FT%TZ)"
exit "$result"
