import { callApi } from "../api";
import { CreateNetworkParams, CreateNetworkResponse, DeleteNetworkParams, JobIdResponse } from "../api/types";
import { runAsyncJob, runSyncJob, JobDefinition } from "../scheduler";
import { WithDemoParams } from "./index";
import { SUBNET_GATEWAY, SUBNET_NETMASK } from "../config";

export function subnetJob(deploymentName: string, withDemoParams: WithDemoParams): JobDefinition {
  return {
    id: "subnet",
    label: "subnet (createNetwork)",
    dependsOn: ["vpc"],
    run: async (hooks, ctx) => {
      const params = withDemoParams<CreateNetworkParams>("subnet", {
        vpcid: ctx.resources.vpc,
        name: `${deploymentName}-subnet`,
        gateway: SUBNET_GATEWAY,
        netmask: SUBNET_NETMASK,
      });

      const result = await runSyncJob("createNetwork", () => callApi<CreateNetworkResponse>("createNetwork", params), hooks);
      return result.network.id;
    },
    rollback: async (subnetId, hooks) => {
      // Required - deleteVpc refuses while any network is still attached.
      const params: DeleteNetworkParams = { id: subnetId };
      await runAsyncJob("deleteNetwork", () => callApi<JobIdResponse>("deleteNetwork", params), hooks);
    },
  };
}
