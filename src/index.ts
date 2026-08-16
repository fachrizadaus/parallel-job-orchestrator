/**
 * index.ts
 *
 * CLI entry point for a real run. Only --publicIp is supported here - forcing
 * a failure or timeout for testing/demo purposes goes through named scenarios
 * instead (npm run demo:list / demo:run <name>, see src/demo/).
 */

import { RunContext } from "./scheduler";
import { buildJobs } from "./jobs";
import { runAndReport } from "./runAndReport";
import { VPC_CIDR, SERVICE_OFFERING_ID, TEMPLATE_ID, SUBNET_GATEWAY, SUBNET_NETMASK, ACL_RULESET } from "./demo/fixtures";

function parseArgs(argv: string[]): { publicIp: boolean } {
  const args = Object.fromEntries(
    argv
      .filter((a) => a.startsWith("--"))
      .map((a) => a.slice(2).split("="))
      .map(([k, v]) => [k, v ?? "true"])
  );

  return { publicIp: args.publicIp !== "false" }; // default true
}

async function main() {
  const { publicIp } = parseArgs(process.argv.slice(2));
  const deploymentName = `demo-${Date.now()}`;

  console.log("=".repeat(60));
  console.log(`WowDev Contest - VM Deployment Orchestrator`);
  console.log(`  publicIp:  ${publicIp}`);
  console.log("=".repeat(60));

  // Begin the deployment run, which will orchestrate the jobs and handle retries, rollbacks, and logging.
  // Job builder is currently configured using demo parameters.
  // if later we want to support a real run with different parameters, we can add more CLI args and pass them here.
  const jobs = buildJobs({
    deploymentName,
    publicIp,
    vpcCidr: VPC_CIDR,
    serviceOfferingId: SERVICE_OFFERING_ID,
    templateId: TEMPLATE_ID,
    subnetGateway: SUBNET_GATEWAY,
    subnetNetmask: SUBNET_NETMASK,
    aclRules: ACL_RULESET,
  });
  const ctx: RunContext = { resources: {}, cloudJobIds: {}, publicIp };

  await runAndReport(jobs, ctx);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
