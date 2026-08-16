/**
 * jobs/index.ts
 *
 * Assembles the deployment pipeline from the individual job files.
 * Order in the returned array only affects the job board's display order -
 * actual execution order is driven entirely by each job's `dependsOn`.
 */

import { JobDefinition } from "../scheduler";
import { AclRuleConfig } from "../api/types";
import { vpcJob } from "./vpc";
import { subnetJob } from "./subnet";
import { aclListJob } from "./aclList";
import { buildAclRuleJobs } from "./aclRule";
import { attachAclJob } from "./attachAcl";
import { deployVmJob } from "./deployVm";
import { publicIpJob } from "./publicIp";
import { staticNatJob } from "./staticNat";

export interface BuildJobsOpts {
  deploymentName: string;
  publicIp: boolean;
  vpcCidr: string;
  serviceOfferingId: string;
  templateId: string;
  subnetGateway: string;
  subnetNetmask: string;
  aclRules: AclRuleConfig[];
}

// Builds the jobs pipeline. Array order only affects the job board's display order -
// actual execution order is driven by each job's `dependsOn`.
// publicIp/staticNat are only included when opts.publicIp is true.
export function buildJobs(opts: BuildJobsOpts): JobDefinition[] {
  return [
    vpcJob(opts.deploymentName, opts.vpcCidr),
    subnetJob(opts.deploymentName, opts.subnetGateway, opts.subnetNetmask),
    aclListJob(opts.deploymentName),
    ...buildAclRuleJobs(opts.aclRules),
    attachAclJob(opts.aclRules.length),
    deployVmJob(opts.serviceOfferingId, opts.templateId),
    ...(opts.publicIp ? [publicIpJob(), staticNatJob()] : []),
  ];
}
