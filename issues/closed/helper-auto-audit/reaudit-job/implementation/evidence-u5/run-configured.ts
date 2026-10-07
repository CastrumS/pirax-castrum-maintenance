// Load prerequisites only with Bun --env-file at the registered checkout, then inherit them in the configured command.
const child = Bun.spawn(["bash", "-c", ': "${AKROGON_BASE:?AKROGON_BASE is required}" && bun test'], {
  cwd: "/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/issues/worktrees/reaudit-job-u5",
  env: process.env, stdin: "ignore", stdout: "inherit", stderr: "inherit",
});
process.exit(await child.exited);
