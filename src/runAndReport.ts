/**
 * runAndReport.ts
 *
 * Runs a built job list and prints the same formatted summary (success, failure, MANUAL CLEANUP REQUIRED).
 * Exits the process with the matching code - this is the last thing either caller does.
 *
 * Also prints one final machine-readable line (RESULT_JSON:<json>) after the human-readable summary, 
 * so a caller spawning this as a subprocess (e.g. a backend service) can read back what was created/failed/rolled back.
 */

import { runJobs, RunContext, JobDefinition } from "./scheduler";
import { ApiTimeoutError, ApiCommandError } from "./errors";

function formatDuration(ms: number): string {
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
  const rounded = Math.round(totalSeconds);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return `${minutes}m ${seconds}s`;
}

// Errors aren't reliably JSON-serializable (some carry circular/non-plain fields) 
// pull out just what a caller can actually act on.
function serializeError(error: unknown): { name: string; message: string;[k: string]: unknown } | null {
  if (error === undefined) return null;
  if (error instanceof ApiCommandError) return { name: error.name, message: error.message, errorcode: error.errorcode, cserrorcode: error.cserrorcode };
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: "UnknownError", message: String(error) };
}

export async function runAndReport(jobs: JobDefinition[], ctx: RunContext): Promise<never> {
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

  // Print out a machine-readable summary line.
  console.log("RESULT_JSON: " + JSON.stringify({
    success: result.success,
    completedJobs: result.completedJobs,
    failedJob: result.failedJob ?? null,
    rolledBack: result.rolledBack,
    rollbackFailed: result.rollbackFailed,
    error: serializeError(result.error),
    resources: ctx.resources,
    cloudJobIds: ctx.cloudJobIds,
    elapsedMs,
  }));

  process.exit(result.success ? 0 : 1);
}
