import { CreateNetworkACLListParams, JobIdResponse } from "../api/types";
import { runAsyncJob, JobDefinition } from "../scheduler";

export function aclListJob(deploymentName: string): JobDefinition {
  return {
    id: "aclList",
    label: "aclList (createNetworkACLList)",
    dependsOn: ["vpc"],
    // No independent rollback - assuming it is covered by the VPC delete cascade.
    run: async (hooks, ctx) => {
      const params: CreateNetworkACLListParams = {
        vpcid: ctx.resources.vpc,
        name: `${deploymentName}-acl`,
      };

      const result = await runAsyncJob<JobIdResponse>("aclList", "createNetworkACLList", params, hooks);
      ctx.cloudJobIds.aclList = result.jobid;
      return result.jobresult.networkacllist?.id ?? result.jobresult.aclList?.id;
    },
  };
}
