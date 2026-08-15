/**
 * board/rows.ts
 *
 * Translates the scheduler's live state into what each job board row says.
 * 
 */

import { ApiCancelledError } from "../errors";
import { RetryEvent, JobDefinition } from "../scheduler/types";
import { formatClock, formatElapsed } from "./index";

/** A snapshot of runJobs()'s live bookkeeping at the moment of a redraw. */
export interface JobRunState {
  startedAt: Map<string, number>;
  endedAt: Map<string, number>;
  retryState: Map<string, RetryEvent & { resumeAt?: number }>;
  failedJobs: Map<string, unknown>;
  completed: Set<string>;
  inFlight: Set<string>;
  stopDispatch: boolean;
  resources: Record<string, string>;
  cloudJobIds: Record<string, string>;
}

/** "jobid=<cloudstack jobid> id=<resource id>" - omits jobid for sync commands, which never have one. */
function formatDone(job: JobDefinition, state: JobRunState): string {
  const resourceId = state.resources[job.id] || "(none)";
  const cloudJobId = state.cloudJobIds[job.id];
  return cloudJobId ? `jobid=${cloudJobId} id=${resourceId}` : `id=${resourceId}`;
}

/** One row per job, in `jobs` order. */
export function buildJobRows(jobs: JobDefinition[], state: JobRunState): string[][] {
  return jobs.map((job) => {
    const label = job.label ?? job.id;
    const start = state.startedAt.get(job.id);
    const end = state.endedAt.get(job.id);
    const retry = state.retryState.get(job.id);
    const tryCell = retry && (retry.attempt > 1 || retry.retryInMs !== undefined)
      ? `${retry.attempt}/${retry.totalAttempts}`
      : "";

    if (state.failedJobs.has(job.id)) {
      const err = state.failedJobs.get(job.id);
      const rowState = err instanceof ApiCancelledError ? "Cancelled" : "Failed";
      const detail = err instanceof Error ? err.message : String(err);
      return [rowState, label, tryCell, formatClock(start!), formatClock(end!), formatElapsed(end! - start!), detail];
    }

    const hadTimeout = retry && retry.attempt > 1;
    const timeoutCount = hadTimeout ? retry!.attempt - 1 : 0;
    const timeoutWord = `${timeoutCount} timeout${timeoutCount > 1 ? "s" : ""}`;

    if (state.completed.has(job.id)) {
      const detail = hadTimeout ? `${formatDone(job, state)} (recovered after ${timeoutWord})` : formatDone(job, state);
      return ["Done", label, tryCell, formatClock(start!), formatClock(end!), formatElapsed(end! - start!), detail];
    }
    if (state.inFlight.has(job.id)) {
      if (retry?.resumeAt !== undefined) {
        const waitS = (Math.max(0, retry.resumeAt - Date.now()) / 1000).toFixed(1);
        return ["Retrying", label, tryCell, formatClock(start!), "--", formatElapsed(Date.now() - start!), `timeout - next attempt in ${waitS}s`];
      }
      const detail = hadTimeout ? `retrying after ${timeoutWord} so far` : "";
      return ["Running", label, tryCell, formatClock(start!), "--", formatElapsed(Date.now() - start!), detail];
    }
    if (state.stopDispatch) {
      return ["Skipped", label, tryCell, "--", "--", "--", "(dispatch halted)"];
    }
    const waitingOn = job.dependsOn.filter((d) => !state.completed.has(d)).join(", ");
    return ["Waiting", label, tryCell, "--", "--", "--", `needs: ${waitingOn}`];
  });
}
