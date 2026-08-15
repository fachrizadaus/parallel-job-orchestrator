/**
 * scheduler/index.ts
 *
 * The dispatch algorithm: runs a list of jobs that declare their own dependencies, starting each one the instant its dependencies are done
 * (not in fixed batches), and rolling back everything completed so far if one fails. Retry/backoff mechanics live in retry.ts; 
 * the job/run type contracts live in types.ts.
 */

import { LiveBoard } from "../board";
import { buildJobRows } from "../board/rows";
import { JobHooks, RetryEvent, JobDefinition, RunContext, RunResult, CompletedJob, JobOutcome } from "./types";

export { runAsyncJob, runSyncJob, pollJob } from "./retry";
export type { JobHooks, RetryEvent, JobDefinition, RunContext, RunResult } from "./types";

/**
 * Used for rollback calls, which run after the board is done.
 */
export const NO_BOARD_HOOKS: JobHooks = {
  signal: new AbortController().signal, // never aborted
  onAttempt: () => false, // "not shown anywhere" - falls back to console.warn
};

/**
 * Every job starts the instant its own dependencies are done and it never waits on unrelated siblings.
 * On failure, no in-flight job is cancelled (it's left to finish), but no new jobs are started.
 * Once all in-flight jobs have finished, whatever succeeded is rolled back in reverse order (LIFO).
 */
export async function runJobs(jobs: JobDefinition[], ctx: RunContext): Promise<RunResult> {
  const remaining = new Map(jobs.map((j) => [j.id, j]));
  const inFlight = new Map<string, Promise<JobOutcome>>();
  const completed = new Set<string>();
  const undoStack: CompletedJob[] = [];
  const completedJobs: string[] = [];
  const startedAt = new Map<string, number>();
  const endedAt = new Map<string, number>();
  const retryState = new Map<string, RetryEvent & { resumeAt?: number }>();
  const failedJobs = new Map<string, unknown>(); // every job that ended ok:false
  let stopDispatch = false;
  let firstFailure: { jobId: string; error: unknown } | undefined;

  const runController = new AbortController(); // fires the moment any job fails

  const board = new LiveBoard();
  let boardTimer: ReturnType<typeof setInterval> | undefined;

  const isEligible = (job: JobDefinition) => job.dependsOn.every((dep) => completed.has(dep));

  function refreshBoard() {
    board.draw(buildJobRows(jobs, {
      startedAt,
      endedAt,
      retryState,
      failedJobs,
      completed,
      inFlight: new Set(inFlight.keys()),
      stopDispatch,
      resources: ctx.resources,
      cloudJobIds: ctx.cloudJobIds,
    }));
  }

  function dispatchEligible() {
    if (stopDispatch) return;
    for (const job of remaining.values()) {
      if (inFlight.has(job.id) || !isEligible(job)) continue;

      startedAt.set(job.id, Date.now());

      const hooks: JobHooks = {
        signal: runController.signal,
        onAttempt: (event) => {
          if (event.attempt === 1 && event.retryInMs === undefined) return board.interactive;

          retryState.set(job.id, { ...event, resumeAt: event.retryInMs === undefined ? undefined : Date.now() + event.retryInMs });

          if (board.interactive) refreshBoard();
          return board.interactive;
        },
      };

      const outcome: Promise<JobOutcome> = job
        .run(hooks, ctx)
        .then((resourceId): JobOutcome => ({ job, ok: true, resourceId }))
        .catch((error): JobOutcome => ({ job, ok: false, error }));

      inFlight.set(job.id, outcome);
    }
  }

  let interrupted = false;
  let resolveInterrupt!: () => void;
  const interruptSignal = new Promise<void>((resolve) => { resolveInterrupt = resolve; });

  const onSigint = () => {
    if (interrupted) return;
    interrupted = true;
    process.removeListener("SIGINT", onSigint); // a 2nd force-kills via Node's default handler
    runController.abort(); // let any idle backoff-sleeping job give up early
    resolveInterrupt();
  };
  process.on("SIGINT", onSigint);

  try {
    dispatchEligible(); // start every root job (job with no dependencies) immediately
    refreshBoard();

    if (board.interactive) boardTimer = setInterval(refreshBoard, 500);

    while (inFlight.size > 0 && !interrupted) {
      // Promise.race() settles the instant ANY one job finishes, so we react to each job individually as soon as it's done.
      // Promise.all() / Promise.allSettled() would wait for EVERY currently-running job to finish before we could act on any of them.
      // reference: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/race
      const raced = await Promise.race<{ kind: "outcome"; outcome: JobOutcome } | { kind: "interrupted" }>([
        Promise.race(inFlight.values()).then((outcome) => ({ kind: "outcome", outcome })),
        interruptSignal.then(() => ({ kind: "interrupted" })),
      ]);

      if (raced.kind === "interrupted") break;

      const outcome = raced.outcome;
      inFlight.delete(outcome.job.id);
      remaining.delete(outcome.job.id);
      endedAt.set(outcome.job.id, Date.now());

      if (outcome.ok) {
        ctx.resources[outcome.job.id] = outcome.resourceId;
        completed.add(outcome.job.id);
        completedJobs.push(outcome.job.id);

        if (outcome.job.rollback) {
          undoStack.push({ jobId: outcome.job.id, resourceId: outcome.resourceId, rollback: outcome.job.rollback });
        }

        dispatchEligible(); // try dispatching any jobs that became eligible due to this job's completion.
      } else {
        failedJobs.set(outcome.job.id, outcome.error);
        if (!firstFailure) firstFailure = {
          jobId: outcome.job.id,
          error: outcome.error
        };

        stopDispatch = true; // stop starting new jobs; let in-flight ones finish naturally
        runController.abort(); // let idle backoff-sleeping job give up early
      }

      if (board.interactive) refreshBoard();
    }

    if (boardTimer) clearInterval(boardTimer);

    if (interrupted) {
      // Unlike a normal failure (which lets in-flight jobs finish naturally before rolling back), 
      // an interrupt is a hard stop - we don't wait for in-flight jobs to finish, 
      // we just roll back whatever completed so far and exit immediately.
      const stillInFlight = [...inFlight.keys()];
      console.log(`\nInterrupted - rolling back ${undoStack.length} completed job(s) before exiting...`);
      if (stillInFlight.length > 0) {
        console.log(`   WARNING: ${stillInFlight.length} job(s) were still in flight and were abandoned (not waited on): ${stillInFlight.join(", ")}`);
        console.log(`   Their fate is unknown - check the CloudStack console manually.`);
      }

      const { rolledBack, rollbackFailed } = await rollback(undoStack, ctx);
      console.log(`Rolled back: ${rolledBack.join(", ") || "(nothing to roll back)"}`);
      if (rollbackFailed.length > 0) {
        console.log(`\nMANUAL CLEANUP REQUIRED - rollback failed for these resources:`);
        for (const { jobId, resourceId } of rollbackFailed) {
          console.log(`   - ${jobId}: ${resourceId} (still exists in the cloud, was NOT deleted)`);
        }
      }
      process.exit(130); // 128 + SIGINT(2), conventional Unix exit code for a signal-terminated process
    }

    if (!firstFailure && remaining.size > 0) {
      // Nothing failed, but some jobs never became eligible - this is a possible dependency cycle or a typo in dependsOn.
      throw new Error(`Scheduler stuck: jobs [${[...remaining.keys()].join(", ")}] never became eligible`);
    }

    refreshBoard(); // final state render

    if (firstFailure) {
      console.log(`\nStopping further dispatch - rolling back completed jobs...`);
      const { rolledBack, rollbackFailed } = await rollback(undoStack, ctx);
      return { success: false, completedJobs, failedJob: firstFailure.jobId, rolledBack, rollbackFailed, error: firstFailure.error };
    }

    return { success: true, completedJobs, rolledBack: [], rollbackFailed: [] };
  } finally {
    process.removeListener("SIGINT", onSigint);
  }
}

/**
 * Undo everything in `undoStack`, most-recently-completed first (LIFO).
 * If a rollback also fails, the resource is orphaned and the caller is expected to warned about it.
 */
async function rollback(
  undoStack: CompletedJob[],
  ctx: RunContext
): Promise<{ rolledBack: string[]; rollbackFailed: Array<{ jobId: string; resourceId: string }> }> {
  const rolledBack: string[] = [];
  const rollbackFailed: Array<{ jobId: string; resourceId: string }> = [];

  if (undoStack.length === 0) {
    console.log(`  (nothing to roll back)`);
    return { rolledBack, rollbackFailed };
  }

  for (let i = undoStack.length - 1; i >= 0; i--) {
    const { jobId, resourceId, rollback: undo } = undoStack[i];

    console.log(`rolling back ${jobId}...`);
    try {
      await undo(resourceId, NO_BOARD_HOOKS, ctx);
      console.log(`   ${jobId} rolled back`);
      rolledBack.push(jobId);
    } catch (err) {
      // This resource is now orphaned - track it so the caller informed instead of quietly treating it like "nothing to roll back".
      console.error(`  rollback FAILED for "${jobId}" (resource ${resourceId} NOT cleaned up):`, err instanceof Error ? err.message : err);
      rollbackFailed.push({ jobId, resourceId });
    }
  }

  return { rolledBack, rollbackFailed };
}
