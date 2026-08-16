/**
 * demo/types.ts
 *
 * The shape of a demo scenario
 * 
 */

export interface JobSimulation {
  // The first N attempts of this job's start call time out; 
  // the attempt after that goes through with no injected params (a real request). 
  // Lets a scenario demonstrate "timed out twice, succeeded on the third attempt."
  timeoutAttempts?: number;
  // Every attempt times out - retries exhaust and the job fails for real.
  alwaysTimeout?: boolean;
  // The first attempt is rejected by CloudStack (jobstatus=2 for async commands, an error-shaped response for sync ones) 
  // never retried, since a genuine rejection isn't something retrying can fix.
  failNow?: boolean;
}

export interface DemoScenario {
  name: string;
  description: string;
  publicIp: boolean;
  // How many rules from ACL_RULESET to actually create
  aclRulesetCount?: number;
  // jobId -> what to do to it. Jobs not listed here run normally.
  simulate?: Record<string, JobSimulation>;
}
