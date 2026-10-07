#!/usr/bin/env bash
set -u
LEAF=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/helper-auto-audit/reaudit-job
export PATH=/home/rudi/.local/share/mise/installs/node/24.21.0/bin:/home/rudi/.local/share/mise/installs/gh/latest/gh_2.101.0_linux_amd64/bin:$PATH
cd /home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job-u5 || exit 2
/home/rudi/.local/bin/pi --print --model openai-codex/gpt-6-astra --thinking high --approve --exclude-tools request_user_input "You are delegated implementation worker u5, not the coordinating seat. Execute only /home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/open/helper-auto-audit/reaudit-job/implementation/brief-5.md in worktree /home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job-u5. Read the brief before editing, follow sections 5 and 6, reread section 8 and fill its report before returning. Do not create other workers or call akrogon phase. Poll every long check until its actual terminal exit; a final waiting message is not completion." > "$LEAF/implementation/evidence/worker-u5.log" 2>&1
result=$?
printf '%s\n' "$result" > "$LEAF/implementation/evidence/worker-u5.exit"
exit "$result"
