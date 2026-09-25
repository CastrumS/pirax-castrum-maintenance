# Verify bridged fixture installation before accepting visual evidence

On 2026-09-25, visual-health-check worker 4 found that a Node Buffer passed through the pinned Playground 3.1.55 bridge installed malformed fixture-plugin bytes. WordPress still served pages and early screenshot/storage assertions passed, but they did not establish that the intended deterministic plugin was running. The rendered report exposed the malformed plugin; the isolated health scenario then failed with `new health must fail`.

The repair reads the PHP source as UTF-8 text, installs that string, and requires exact `readFileAsText` equality before bridge readiness. The harness also fetches the running WordPress page and requires both seeded content and `data-visual-fixture="true"` before baseline. Readback establishes installation fidelity; the served marker establishes that the intended fixture is active. Keep both checks when changing this bridge or fixture.

Repository source carrying the fix:

- [Playground bridge](../../test/wp/playground.ts): UTF-8 installation and exact readback, same-instance WP-CLI control.
- [Fixture plugin](../../test/wp/fixture-plugin.php): served marker and controlled health cases.
- [Visual selftest](../../scripts/visual-selftest.ts): marker/content assertion before baseline and real WordPress/R2 checks.
- [Pinned Blueprint](../../test/wp/blueprint.json): WordPress 6.8.3, PHP 8.3 and WP-CLI 2.12.0; Playground packages are pinned in `package.json`/`bun.lock`.

Worker-4 evidence, relative to the authoritative leaf `issues/open/site-checks/visual-health-check/` in the owning repository:

- `implementation/worker-4.md` records the diagnosis, repair and final validation.
- `implementation/unit-4-integration-third.log` records the health assertion failure after earlier scenarios passed.
- `implementation/unit-4-validation.log` records the final successful run.

Retained local evidence, relative to the implementation worktree (gitignored, not committed source):

- `runs/visual-selftest-2026-09-25T16-44-41.594Z/summary.json`: failed health scenario, 17 command invocations, cleanup confirmed zero remaining remote objects. This is failure evidence, not accepted deterministic-fixture evidence.
- `runs/visual-selftest-2026-09-25T16-56-31.445Z/summary.json`: final pass, 15 scenarios, 44 command invocations, cleanup deleted 198 objects and confirmed zero remaining; fixture processes stopped.
- `runs/visual-selftest-2026-09-25T16-56-31.445Z/commands/2026-09-25T16-56-56.177Z/index.html`: changed-alpha/stable-beta report. Its sibling `remote-report.png`, `remote-report.trace.zip` and `remote-render.json` retain rendered evidence; capture traces are under `traces/`.

This is an observed failure of this Node Buffer/Playground bridge path, not evidence that all RPC byte APIs or typed arrays are broken. The reusable lesson is to verify content after crossing the boundary and verify that the served fixture uses it, before accepting downstream visual assertions.

Storage and authentication remained real, scoped to a disposable test root; no mocks were substituted. Credential values and signed bearer URLs do not belong in evidence. Environment files must not be opened, printed, appended to or rewritten for diagnosis. This documentation records worker-4 evidence; it does not claim a new integration run or forced storage-network-failure test.
