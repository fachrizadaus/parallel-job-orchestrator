/**
 * scheduler/retry.ts
 *
 * How to reliably call one CloudStack command:
 * - retry on timeout with exponential backoff
 * - for async commands, poll until a real answer comes back.
 *
 * Owns every callApi() call in the run - jobs never call callApi() directly,
 * they just hand this their command name and params once. That's what keeps
 * jobs free of any retry/demo-interception concerns of their own.
 */

import { callApi, JobResultResponse } from "../api";
import { ApiTimeoutError, ApiJobFailedError, ApiCancelledError } from "../errors";
import { DEFAULT_MAX_RETRIES, DEFAULT_POLL_INTERVAL_MS, BACKOFF_BASE_MS, BACKOFF_CAP_MS, BACKOFF_JITTER_MS } from "../config";
import { JobHooks } from "./types";

type Params = Record<string, string | number | boolean>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 
 * Same as sleep(), but ends early if `signal` fires - used only for the retry backoff wait, which is safe to cut short. 
 */
function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return sleep(ms);
  if (signal.aborted) return Promise.resolve();

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Backoff delay is exponential with jitter, not plain exponential: this scheduler runs jobs in parallel,
 * so if several time out around the same moment, plain exponential backoff would have them all retry at the exact
 * same instant, repeatedly. Adding random 0..BACKOFF_JITTER_MS on top will spreads those retries 
 * instead of letting them stack together.
 */
function backoffDelay(attempt: number): number {
  const capped = Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_CAP_MS);
  return capped + Math.random() * BACKOFF_JITTER_MS;
}

/**
 * Retry a single CloudStack command, with exponential backoff on timeout. 
 * `attempt` is expected to throw ApiTimeoutError on timeout, or something else (e.g. ApiCommandError) on a real failure a retry can't fix. 
 * `hooks` reports each attempt (to the live board, or console.warn if there's none - e.g. during rollback), and lets a failure anywhere else 
 * in the run cancel this one early while it's idle between attempts.
 */
async function withRetry<T>(commandName: string, attempt: (n: number) => Promise<T>, hooks: JobHooks, maxRetries: number): Promise<T> {
  const totalAttempts = maxRetries + 1;

  for (let n = 0; n <= maxRetries; n++) {
    try {
      hooks.onAttempt({ attempt: n + 1, totalAttempts });
      return await attempt(n + 1);
    } catch (err) {
      if (!(err instanceof ApiTimeoutError) || n === maxRetries) throw err;

      const delay = backoffDelay(n + 1);
      const shown = hooks.onAttempt({ attempt: n + 1, totalAttempts, retryInMs: delay });
      if (!shown) {
        console.warn(
          `Timeout on "${commandName}", retrying in ${(delay / 1000).toFixed(1)}s ` +
          `(attempt ${n + 1}/${totalAttempts})...`
        );
      }

      await abortableSleep(delay, hooks.signal);
      if (hooks.signal.aborted) {
        throw new ApiCancelledError(commandName);
      }
    }
  }

  throw new Error("unreachable"); // loop above always returns or throws
}

/**
 * Poll queryAsyncJobResult until CloudStack reports success or failure. This polling will never gives up 
 * on jobstatus=0 (still processing), just keeps polling until it eventually succeeds or fails. 
 * If a poll call itself times out it is retried with the same backoff as the start call, up to maxRetries timeouts.
 */
export async function pollJob(commandName: string, jobid: string, hooks: JobHooks, maxRetries = DEFAULT_MAX_RETRIES): Promise<JobResultResponse> {
  let timeouts = 0;
  while (true) {
    try {
      const result = await callApi<JobResultResponse>("queryAsyncJobResult", { jobid });
      timeouts = 0; // a real response resets the count - only consecutive poll timeouts count
      if (result.jobstatus === 1) return result;
      if (result.jobstatus === 2) throw new ApiJobFailedError(commandName, result.jobresult);
      await sleep(DEFAULT_POLL_INTERVAL_MS);
    } catch (err) {
      if (!(err instanceof ApiTimeoutError) || timeouts >= maxRetries) throw err;

      timeouts++;
      const delay = backoffDelay(timeouts);
      const shown = hooks.onAttempt({ attempt: timeouts, totalAttempts: maxRetries + 1, retryInMs: delay });
      if (!shown) {
        console.warn(
          `Timeout polling "${commandName}", retrying in ${(delay / 1000).toFixed(1)}s ` +
          `(attempt ${timeouts}/${maxRetries + 1})...`
        );
      }

      await abortableSleep(delay, hooks.signal);
      if (hooks.signal.aborted) {
        throw new ApiCancelledError(commandName);
      }
    }
  }
}

/**
 * Call a sync CloudStack command (answer comes back immediately, no jobid/polling), retried on timeout. 
 */
export function runSyncJob<T>(jobId: string, command: string, params: Params, hooks: JobHooks, maxRetries = DEFAULT_MAX_RETRIES): Promise<T> {
  return withRetry(command, (attempt) => callApi<T>(command, params, { jobId, attempt }), hooks, maxRetries);
}

/**
 * Call an async CloudStack command (returns a jobid) and poll it to completion.
 * Both the start call and the polling that follows retry on timeout (see pollJob above).
 */
export async function runAsyncJob<T extends { jobid: string }>(
  jobId: string,
  command: string,
  params: Params,
  hooks: JobHooks,
  maxRetries = DEFAULT_MAX_RETRIES
): Promise<JobResultResponse> {
  const { jobid } = await withRetry(command, (attempt) => callApi<T>(command, params, { jobId, attempt }), hooks, maxRetries);
  return pollJob(command, jobid, hooks, maxRetries);
}
