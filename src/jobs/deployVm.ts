import { DeployVirtualMachineParams, DestroyVirtualMachineParams, JobIdResponse } from "../api/types";
import { runAsyncJob, JobDefinition } from "../scheduler";

export function deployVmJob(serviceOfferingId: string, templateId: string): JobDefinition {
  return {
    id: "deployVm",
    label: "deployVm (deployVirtualMachine)",
    dependsOn: ["subnet"],
    run: async (hooks, ctx) => {
      const params: DeployVirtualMachineParams = {
        networkids: ctx.resources.subnet,
        serviceofferingid: serviceOfferingId,
        templateid: templateId,
      };

      const result = await runAsyncJob<JobIdResponse>("deployVm", "deployVirtualMachine", params, hooks);
      ctx.cloudJobIds.deployVm = result.jobid;
      return result.jobresult.virtualmachine?.id ?? result.jobresult.vm?.id;
    },
    rollback: async (vmId, hooks) => {
      // Same pattern as vpc/subnet: 
      // assuming the network can't be deleted while a VM still use it, so destroy the VM down first.
      const params: DestroyVirtualMachineParams = { id: vmId };
      await runAsyncJob<JobIdResponse>("deployVm", "destroyVirtualMachine", params, hooks);
    },
  };
}
