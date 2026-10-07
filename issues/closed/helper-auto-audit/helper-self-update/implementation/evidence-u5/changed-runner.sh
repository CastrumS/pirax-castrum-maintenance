#!/bin/sh
# Unit-5 changed-command runner. Seed omitted: PIRAX_HELPER_SIGNING_KEY is set empty so Bun's
# auto-loaded worktree .env (symlink to the registered .env) cannot restore it; every other
# prerequisite is loaded by Bun from that file. Writes changed.log, then changed.exit as marker.
E=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/helper-auto-audit/helper-self-update/implementation/evidence-u5
cd /home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/helper-self-update-u5 || exit 99
commit=$(git rev-parse --short HEAD)
{ echo "\$ bun run build:plugin"; bun run build:plugin; echo "build-exit=$?"; } > "$E/build-plugin.log" 2>&1
{
  echo "\$ PIRAX_HELPER_SIGNING_KEY= AKROGON_BASE=2689aaa3bd69a9a46cc77788fdc5219354cc923a sh -c ': \"\${AKROGON_BASE:?AKROGON_BASE is required}\" && bun test'"
  echo "commit=$commit started=$(date -Iseconds)"
  PIRAX_HELPER_SIGNING_KEY= AKROGON_BASE=2689aaa3bd69a9a46cc77788fdc5219354cc923a sh -c ': "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test'
} > "$E/changed.log" 2>&1
code=$?
echo "exit=$code commit=$commit finished=$(date -Iseconds)" > "$E/changed.exit"
