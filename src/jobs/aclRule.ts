import { CreateNetworkACLParams, AclRuleConfig, JobIdResponse } from "../api/types";
import { runAsyncJob, JobDefinition } from "../scheduler";

function aclRuleJob(id: string, rule: AclRuleConfig): JobDefinition {
  const { protocol, cidr, action, ...extra } = rule;

  return {
    id,
    label: `${id} (createNetworkACL)`,
    dependsOn: ["aclList"],
    run: async (hooks, ctx) => {
      const params: CreateNetworkACLParams = {
        aclid: ctx.resources.aclList,
        protocol,
        cidrlist: cidr,
        action,
        ...extra,
      };

      const result = await runAsyncJob<JobIdResponse>(id, "createNetworkACL", params, hooks);
      ctx.cloudJobIds[id] = result.jobid;
      return result.jobresult.networkacl?.id ?? "";
    },
  };
}

// One job per rule in `rules`, ids aclRule1..aclRuleN. All depend only on
// aclList, so the scheduler runs them in parallel.
export function buildAclRuleJobs(rules: AclRuleConfig[]): JobDefinition[] {
  return rules.map((rule, i) => aclRuleJob(`aclRule${i + 1}`, rule));
}
