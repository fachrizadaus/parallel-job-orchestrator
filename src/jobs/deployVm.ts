import { callApi } from "../api";
import { DeployVirtualMachineParams, DestroyVirtualMachineParams, JobIdResponse } from "../api/types";
import { runAsyncJob, JobDefinition } from "../scheduler";
import { WithDemoParams } from "./index";
import { SERVICE_OFFERING_ID, TEMPLATE_ID } from "../config";

export function deployVmJob(withDemoParams: WithDemoParams): JobDefinition {
  return {
    id: "deployVm",
    label: "deployVm (deployVirtualMachine)",
    dependsOn: ["subnet"],
    run: async (hooks, ctx) => {
      const params = withDemoParams<DeployVirtualMachineParams>("deployVm", {
        networkids: ctx.resources.subnet,
        serviceofferingid: SERVICE_OFFERING_ID,
        templateid: TEMPLATE_ID,
      });

      const result = await runAsyncJob("deployVirtualMachine", () => callApi<JobIdResponse>("deployVirtualMachine", params), hooks);
      ctx.cloudJobIds.deployVm = result.jobid;
      return result.jobresult.virtualmachine?.id ?? result.jobresult.vm?.id;
    },
    rollback: async (vmId, hooks) => {
      // Same pattern as vpc/subnet: 
      // assuming the network can't be deleted while a VM still use it, so destroy the VM down first.
      const params: DestroyVirtualMachineParams = { id: vmId };
      await runAsyncJob("destroyVirtualMachine", () => callApi<JobIdResponse>("destroyVirtualMachine", params), hooks);
    },
  };
}
