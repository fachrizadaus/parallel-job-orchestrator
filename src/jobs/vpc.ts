import { CreateVpcParams, DeleteVpcParams, JobIdResponse } from "../api/types";
import { runAsyncJob, JobDefinition } from "../scheduler";

export function vpcJob(deploymentName: string, cidr: string): JobDefinition {
  return {
    id: "vpc",
    label: "vpc (createVpc)",
    dependsOn: [],
    run: async (hooks, ctx) => {
      const params: CreateVpcParams = { name: deploymentName, cidr };

      const result = await runAsyncJob<JobIdResponse>("vpc", "createVpc", params, hooks);
      ctx.cloudJobIds.vpc = result.jobid;
      return result.jobresult.vpc.id;
    },
    rollback: async (vpcId, hooks) => {
      // deleteVpc refuses while a network is still attached to it, so it must be deleted last
      const params: DeleteVpcParams = { id: vpcId };
      await runAsyncJob<JobIdResponse>("vpc", "deleteVpc", params, hooks);
    },
  };
}
