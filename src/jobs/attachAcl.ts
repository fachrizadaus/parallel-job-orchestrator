import { ReplaceNetworkACLListParams, JobIdResponse } from "../api/types";
import { runAsyncJob, JobDefinition } from "../scheduler";

// Waits for every configured ACL rule (aclRule1..aclRuleN, one per entry in the aclRules the caller passed to buildAclRuleJobs()) 
// so the network is never attached to an ACL list that's still missing rules.
export function attachAclJob(aclRuleCount: number): JobDefinition {
  const aclRuleIds = Array.from({ length: aclRuleCount }, (_, i) => `aclRule${i + 1}`);

  return {
    id: "attachAcl",
    label: "attachAcl (replaceNetworkACLList)",
    dependsOn: ["aclList", "subnet", ...aclRuleIds],
    run: async (hooks, ctx) => {
      const params: ReplaceNetworkACLListParams = {
        aclid: ctx.resources.aclList,
        networkid: ctx.resources.subnet,
      };

      const result = await runAsyncJob<JobIdResponse>("attachAcl", "replaceNetworkACLList", params, hooks);
      ctx.cloudJobIds.attachAcl = result.jobid;
      return "";
    },
  };
}
