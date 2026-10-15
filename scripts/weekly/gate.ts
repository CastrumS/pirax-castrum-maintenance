// Weekly check gate: prints the selected deployment's weeklyCheck flag as a GitHub Actions step output, so
// weekly-check.yml skips its check job for a deployment that has not opted in. An unusable DEPLOYMENT or an Actions
// run of another repository fails with nothing on stdout. Writes no file and needs no node_modules.
//
// Usage: DEPLOYMENT=<name> bun --no-install scripts/weekly/gate.ts >> "$GITHUB_OUTPUT"   prints enabled=true|false
import { DeploymentConfigError, loadDeployment, type Deployment } from "../../src/deployment.ts";
import { repositoryMismatch } from "../reaudit/heartbeat.ts";

if (process.argv.length > 2) {
  console.error("usage: bun scripts/weekly/gate.ts");
  process.exit(2);
}
let deployment: Deployment;
try {
  deployment = loadDeployment();
} catch (e) {
  if (!(e instanceof DeploymentConfigError)) throw e;
  console.error(`gate: ${e.message}`);
  process.exit(1);
}
if (repositoryMismatch(deployment, process.env)) {
  console.error("gate: GITHUB_REPOSITORY is not the selected deployment's repository");
  process.exit(1);
}
console.log(`enabled=${deployment.config.weeklyCheck.enabled}`);
