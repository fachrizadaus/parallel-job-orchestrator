import { CreateNetworkParams, CreateNetworkResponse, DeleteNetworkParams, JobIdResponse } from "../api/types";
import { runAsyncJob, runSyncJob, JobDefinition } from "../scheduler";

export function subnetJob(deploymentName: string, gateway: string, netmask: string): JobDefinition {
  return {
    id: "subnet",
    label: "subnet (createNetwork)",
    dependsOn: ["vpc"],
    run: async (hooks, ctx) => {
      const params: CreateNetworkParams = {
        vpcid: ctx.resources.vpc,
        name: `${deploymentName}-subnet`,
        gateway,
        netmask,
      };

      const result = await runSyncJob<CreateNetworkResponse>("subnet", "createNetwork", params, hooks);
      return result.network.id;
    },
    rollback: async (subnetId, hooks) => {
      // Required - deleteVpc refuses while any network is still attached.
      const params: DeleteNetworkParams = { id: subnetId };
      await runAsyncJob<JobIdResponse>("subnet", "deleteNetwork", params, hooks);
    },
  };
}
