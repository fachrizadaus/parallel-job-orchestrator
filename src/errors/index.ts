/**
 * errors/index.ts
 *
 * Error types thrown by api/client.ts, used to decide retry vs. fail-immediately.
 */

export class ApiTimeoutError extends Error {
  constructor(command: string) {
    super(`Timeout calling command "${command}"`);
    this.name = "ApiTimeoutError";
  }
}

// A job that actually ran and came back jobstatus=2 - a real failure, not a timeout.
export class ApiJobFailedError extends Error {
  jobResult: unknown;
  constructor(command: string, jobResult: unknown) {
    super(`Job failed for command "${command}" (jobstatus=2)`);
    this.name = "ApiJobFailedError";
    this.jobResult = jobResult;
  }
}

// A job cancelled mid-retry-backoff because a sibling job failed elsewhere in the run.
export class ApiCancelledError extends Error {
  constructor(command: string) {
    super(`Cancelled "${command}" - a sibling job failed, run is rolling back`);
    this.name = "ApiCancelledError";
  }
}

// The API puts application errors (bad/missing param) inside the same 
// envelope key as success, just with errorcode/errortext instead of data.
export class ApiCommandError extends Error {
  errorcode: unknown;
  cserrorcode: unknown;
  raw: unknown;
  constructor(command: string, raw: any) {
    super(`API rejected "${command}": ${raw?.errortext ?? JSON.stringify(raw)}`);
    this.name = "ApiCommandError";
    this.errorcode = raw?.errorcode;
    this.cserrorcode = raw?.cserrorcode;
    this.raw = raw;
  }
}
