/**
 * demo/run.ts
 *
 * `npm run demo:run -- <name>` - runs one selected scenario from scenarios.ts
 * 
 */

import { RunContext } from "../scheduler";
import { buildJobs } from "../jobs";
import { runAndReport } from "../runAndReport";
import { activateScenario } from "./index";
import { SCENARIOS } from "./scenarios";
import { VPC_CIDR, SERVICE_OFFERING_ID, TEMPLATE_ID, SUBNET_GATEWAY, SUBNET_NETMASK, ACL_RULES } from "./fixtures";

function listNames(): void {
  console.log("Available scenarios:");
  for (const s of SCENARIOS) console.log(`  ${s.name}`);
  console.log("\nRun with: npm run demo:run -- <name>");
  console.log("List with descriptions: npm run demo:list");
}

async function main() {
  const name = process.argv[2];

  if (!name) {
    console.error("Usage: npm run demo:run -- <scenario-name>\n");
    listNames();
    process.exit(1);
  }

  const scenario = SCENARIOS.find((s) => s.name === name);
  if (!scenario) {
    console.error(`Unknown scenario "${name}"\n`);
    listNames();
    process.exit(1);
  }

  console.log("=".repeat(60));
  console.log(`WowDev Contest - VM Deployment Orchestrator (demo scenario)`);
  console.log(`  scenario:  ${scenario.name}`);
  console.log(`  ${scenario.description}`);
  console.log(`  publicIp:  ${scenario.publicIp}`);
  console.log("=".repeat(60));

  activateScenario(scenario);

  const deploymentName = `demo-${scenario.name}-${Date.now()}`;
  const jobs = buildJobs({
    deploymentName,
    publicIp: scenario.publicIp,
    vpcCidr: VPC_CIDR,
    serviceOfferingId: SERVICE_OFFERING_ID,
    templateId: TEMPLATE_ID,
    subnetGateway: SUBNET_GATEWAY,
    subnetNetmask: SUBNET_NETMASK,
    aclRules: ACL_RULES,
  });
  const ctx: RunContext = { resources: {}, cloudJobIds: {}, publicIp: scenario.publicIp };

  await runAndReport(jobs, ctx);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
