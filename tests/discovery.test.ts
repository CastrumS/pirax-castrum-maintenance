import { expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// Leaf worktrees live under issues/worktrees/ inside the checkout, and Bun's test discovery ignores
// .gitignore. A sandbox with only this repo's bunfig.toml and trivial tests (never the project suite)
// checks that bare `bun test` still finds tests/ and test/ but skips a failing nested worktree test.
test("bare bun test skips issues/** and still discovers tests/ and test/", () => {
  const dir = mkdtempSync(join(tmpdir(), "discovery-test-"));
  try {
    copyFileSync(join(import.meta.dir, "..", "bunfig.toml"), join(dir, "bunfig.toml"));
    const files = {
      "tests/a.test.ts": "expect(1).toBe(1)",
      "test/b.test.ts": "expect(1).toBe(1)",
      "issues/worktrees/other/tests/nested.test.ts": "expect(1).toBe(2)",
    };
    for (const [file, body] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      writeFileSync(join(dir, file), `import { expect, test } from "bun:test";\ntest(${JSON.stringify(file)}, () => ${body});\n`);
    }
    const r = Bun.spawnSync([process.execPath, "--no-env-file", "test"], { cwd: dir, env: {} });
    const out = r.stdout.toString() + r.stderr.toString();
    expect(out).toContain("Ran 2 tests across 2 files");
    expect(out).not.toContain("nested");
    expect(r.exitCode).toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
