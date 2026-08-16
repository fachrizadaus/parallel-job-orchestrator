import { EnableStaticNatParams, EnableStaticNatResponse, DisassociateIpAddressParams, JobIdResponse } from "../api/types";
import { runAsyncJob, runSyncJob, JobDefinition } from "../scheduler";
import { releaseIp } from "../ipLock";

export function staticNatJob(): JobDefinition {
  return {
    id: "staticNat",
    label: "staticNat (enableStaticNat)",
    dependsOn: ["deployVm", "publicIp"],
    run: async (hooks, ctx) => {
      const params: EnableStaticNatParams = {
        networkid: ctx.resources.subnet,
        ipaddressid: ctx.resources.publicIp,
        virtualmachineid: ctx.resources.deployVm,
      };

      await runSyncJob<EnableStaticNatResponse>("staticNat", "enableStaticNat", params, hooks);
      // Once enableStaticNat succeeds, the public IP is presumed to be "in use",
      // so we can release it from the ip-locks. This is local bookkeeping only, and does not affect the CloudStack state.
      try {
        releaseIp(ctx.resources.publicIp);
      } catch (err) {
        console.warn(`Failed to release local IP lock for ${ctx.resources.publicIp}:`, err instanceof Error ? err.message : err);
      }
      return "";
    },
    rollback: async (_resourceId, hooks, ctx) => {
      const params: DisassociateIpAddressParams = { id: ctx.resources.publicIp };
      await runAsyncJob<JobIdResponse>("staticNat", "disassociateIpAddress", params, hooks);
    },
  };
}
