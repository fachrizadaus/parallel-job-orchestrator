export interface RetryEvent {
  attempt: number;
  totalAttempts: number;
  // Present once the attempt has failed and we're sleeping before the next one.
  retryInMs?: number;
}

/**
 * What every job.run() / job.rollback() receives, so they can call runAsyncJob/runSyncJob 
 * without needing to know about the run's cancellation signal themselves.
 */
export interface JobHooks {
  // Fires the moment any job in the run fails.
  signal: AbortSignal;
  // Reports retry progress. Returns true if the board displayed it, false otherwise.
  onAttempt: (event: RetryEvent) => boolean;
}

export interface JobDefinition {
  id: string;
  // Display label for the job board, e.g. "subnet (createNetwork)" - the internal
  // id plus the actual CloudStack command it calls. Falls back to `id` if omitted.
  label?: string;
  dependsOn: string[];
  /**
   * Runs the job.
   * `hooks` is used by nearly every job (to call runAsyncJob/runSyncJob);
   * `ctx` is only needed by jobs that read an earlier job's resourceId. a job that doesn't need it can just
   * omit it from its own function signature instead of declaring it unused.
   */
  run: (hooks: JobHooks, ctx: RunContext) => Promise<string>;
  // Undoes the job, given the resourceId it produced. Omit if there's nothing to undo.
  rollback?: (resourceId: string, hooks: JobHooks, ctx: RunContext) => Promise<void>;
}

export interface RunContext {
  resources: Record<string, string>; // jobId -> resourceId, filled in as jobs succeed
  // jobId -> CloudStack's own async jobid (queryAsyncJobResult tracking id), only
  // set for async commands. Sync commands (e.g. createNetwork) have no jobid at all.
  cloudJobIds: Record<string, string>;
  publicIp: boolean;
}

export interface RunResult {
  success: boolean;
  completedJobs: string[];
  failedJob?: string;
  rolledBack: string[];
  // Rollback was attempted but failed for these - the resource is still out there and needs manual cleanup.
  rollbackFailed: Array<{ jobId: string; resourceId: string }>;
  error?: unknown;
}


export interface CompletedJob {
  jobId: string;
  resourceId: string;
  rollback: (resourceId: string, hooks: JobHooks, ctx: RunContext) => Promise<void>;
}

export type JobOutcome =
  | { job: JobDefinition; ok: true; resourceId: string }
  | { job: JobDefinition; ok: false; error: unknown };
