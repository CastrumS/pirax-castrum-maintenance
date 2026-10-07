// Synthetic API facts; production observer is unchanged. No network or mail.
import assert from 'node:assert/strict';
import { observe } from '/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job/scripts/reaudit/watchdog.ts';
const now = Date.parse('2026-10-07T12:00:00Z');
const calls: string[][] = [];
const result = observe((args) => {
  calls.push(args);
  const body = args.at(-1)!.includes('/runs?') ? { workflow_runs: [
    { event: 'workflow_dispatch', head_branch: 'reaudit-job', run_started_at: '2026-10-07T11:00:00Z', status: 'completed', conclusion: 'skipped' },
    { event: 'schedule', head_branch: 'main', run_started_at: '2026-10-04T03:17:00Z', status: 'completed', conclusion: 'success' },
  ] } : { path: '.github/workflows/reaudit.yml', state: 'active', created_at: '2026-09-01T00:00:00Z' };
  return { code: 0, stdout: `HTTP/2.0 200 OK\n\n${JSON.stringify(body)}` };
}, now);
console.log(JSON.stringify({ case: 'main overdue, recent non-main skipped dispatch', result, requestedPaths: calls.map(c => c.at(-1)) }));
assert.equal(result.healthy, false, 'A skipped non-main dispatch must not hide the overdue main audit');
