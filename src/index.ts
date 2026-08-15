/**
 * index.ts
 *
 * CLI entry point.
 * 
 */

import { runJobs, RunContext } from "./scheduler";
import { buildJobs } from "./jobs";
import { ApiTimeoutError, ApiCommandError } from "./errors";

// Formats a duration in milliseconds into a human-readable string.
function formatDuration(ms: number): string {
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
  const rounded = Math.round(totalSeconds);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return `${minutes}m ${seconds}s`;
}

function parseArgs(argv: string[]): { publicIp: boolean; failAt?: string; timeoutAt?: string } {
  const args = Object.fromEntries(
    argv
      .filter((a) => a.startsWith("--"))
      .map((a) => a.slice(2).split("="))
      .map(([k, v]) => [k, v ?? "true"])
  );

  return {
    publicIp: args.publicIp !== "false", // default true
    failAt: args.failAt,
    timeoutAt: args.timeoutAt,
  };
}

async function main() {
  const { publicIp, failAt, timeoutAt } = parseArgs(process.argv.slice(2));
  const deploymentName = `demo-${Date.now()}`;

  console.log("=".repeat(60));
  console.log(`WowDev Contest - VM Deployment Orchestrator`);
  console.log(`  publicIp:  ${publicIp}`);
  console.log(`  failAt:    ${failAt ?? "(none)"}`);
  console.log(`  timeoutAt: ${timeoutAt ?? "(none)"}`);
  console.log("=".repeat(60));

  // Begin the deployment run, which will orchestrate the jobs and handle retries, rollbacks, and logging.
  const jobs = buildJobs({ failAt, timeoutAt, deploymentName, publicIp });
  const ctx: RunContext = { resources: {}, cloudJobIds: {}, publicIp };

  const start = Date.now();
  const result = await runJobs(jobs, ctx);
  const elapsedMs = Date.now() - start;

  console.log("-".repeat(60));
  if (result.success) {
    console.log(`Deployment SUCCEEDED in ${formatDuration(elapsedMs)}`);
    console.log(`   Completed jobs: ${result.completedJobs.join(" -> ")}`);
    console.log(`   Resources:`, ctx.resources);
  } else {
    console.log(`Deployment FAILED at job "${result.failedJob}" after ${formatDuration(elapsedMs)}`);
    console.log(`   Completed before failure: ${result.completedJobs.join(", ") || "(none)"}`);
    console.log(`   Rolled back (reverse order): ${result.rolledBack.join(", ") || "(nothing to roll back)"}`);
    console.log(`   Error:`, result.error instanceof Error ? result.error.message : result.error);

    if (result.error instanceof ApiTimeoutError) {
      console.log(`   This looks like the API is unreachable or down (all retries exhausted).`);
    }

    if (result.error instanceof ApiCommandError) {
      console.log(
        `   The API rejected the request itself (errorcode ${result.error.errorcode}) -\n` +
        `   this is a bad/missing parameter, not a connectivity issue.`
      );
    }

    if (result.rollbackFailed.length > 0) {
      console.log(`\nMANUAL CLEANUP REQUIRED - rollback failed for these resources:`);
      for (const { jobId, resourceId } of result.rollbackFailed) {
        console.log(`   - ${jobId}: ${resourceId} (still exists in the cloud, was NOT deleted)`);
      }
      console.log(` These are orphaned and will keep costing/consuming quota until removed manually.`);
    }
  }
  console.log("=".repeat(60));

  process.exit(result.success ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});