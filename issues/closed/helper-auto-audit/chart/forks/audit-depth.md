# Audit depth

## Question
Q1. What must pass before a new plugin version is accepted: the native test suites plus the hook-inventory comparison only, or also an automated code-diff review?

### Carries
- release-approval: automatic publish.
- A's round-1 challenge check recommended adding a code review with automatic release.

## Findings
- Manual audits 2026-09-30..10-01 combined release diffs, hook-registration diffs and `bun --env-file=.env test test/plugin` (69 tests, ~28 min).
- Hook inventory: `audited_hooks()` / `suppressed_callbacks()` in `plugin/pirax-form-test/includes/compatibility.php` already fail closed on any unaudited callback per request.

## Taken
Operator 2026-10-02, verbatim: "3. automated tests and the hook comparison"
Reason: operator choice. Foreclosed: an automated LLM/code-diff review step. Residual risk accepted: behaviour changes inside an already-audited callback or outside audited hooks that the suites do not exercise.
