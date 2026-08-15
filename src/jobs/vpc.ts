import { callApi } from "../api";
import { CreateVpcParams, DeleteVpcParams, JobIdResponse } from "../api/types";
import { runAsyncJob, JobDefinition } from "../scheduler";
import { WithDemoParams } from "./index";

export function vpcJob(deploymentName: string, withDemoParams: WithDemoParams): JobDefinition {
  return {
    id: "vpc",
    label: "vpc (createVpc)",
    dependsOn: [],
    run: async (hooks, ctx) => {
      const params = withDemoParams<CreateVpcParams>("vpc", {
        name: deploymentName, cidr: "10.0.0.0/16"
      });

      const result = await runAsyncJob("createVpc", () => callApi<JobIdResponse>("createVpc", params), hooks);
      ctx.cloudJobIds.vpc = result.jobid;
      return result.jobresult.vpc.id;
    },
    rollback: async (vpcId, hooks) => {
      // deleteVpc refuses while a network is still attached to it, so it must be deleted last
      const params: DeleteVpcParams = { id: vpcId };
      await runAsyncJob("deleteVpc", () => callApi<JobIdResponse>("deleteVpc", params), hooks);
    },
  };
}
