/**
 * jobs/index.ts
 *
 * Assembles the deployment pipeline from the individual job files.
 * Order in the returned array only affects the job board's display order -
 * actual execution order is driven entirely by each job's `dependsOn`.
 */

import { JobDefinition } from "../scheduler";
import { vpcJob } from "./vpc";
import { subnetJob } from "./subnet";
import { aclListJob } from "./aclList";
import { aclRuleJob } from "./aclRule";
import { attachAclJob } from "./attachAcl";
import { deployVmJob } from "./deployVm";
import { publicIpJob } from "./publicIp";
import { staticNatJob } from "./staticNat";

// Builds a helper function that injects demo params into each job's API call. The demo params
// are used to simulate failures and timeouts for testing the rollback logic. The helper is
// passed to each job's factory function.
export type WithDemoParams = <T extends Record<string, any>>(jobId: string, params: T) => T;
export function makeDemoParamHelper(failAt: string | undefined, timeoutAt: string | undefined): WithDemoParams {
  return function withDemoParams<T extends Record<string, any>>(jobId: string, params: T): T {
    if (jobId === failAt) params = { ...params, result: 2 };
    if (jobId === timeoutAt) params = { ...params, timeout: 35 };

    return params;
  };
}

// Builds the jobs pipeline. Array order only affects the job board's display order
// actual execution order is driven by each job's `dependsOn`. 
// publicIp/staticNat are only included when opts.publicIp is true.
export function buildJobs(opts: { failAt?: string; timeoutAt?: string; deploymentName: string; publicIp: boolean; }): JobDefinition[] {
  const withDemoParams = makeDemoParamHelper(opts.failAt, opts.timeoutAt);

  return [
    vpcJob(opts.deploymentName, withDemoParams),
    subnetJob(opts.deploymentName, withDemoParams),
    aclListJob(opts.deploymentName, withDemoParams),
    aclRuleJob(withDemoParams),
    attachAclJob(withDemoParams),
    deployVmJob(withDemoParams),
    ...(opts.publicIp ? [publicIpJob(withDemoParams), staticNatJob(withDemoParams)] : []),
  ];
}
