import { callApi } from "../api";
import { ListPublicIpAddressesResponse } from "../api/types";
import { runSyncJob, JobDefinition } from "../scheduler";
import { WithDemoParams } from "./index";
import { claimFreeIp, releaseIp } from "../ipLock";

export function publicIpJob(withDemoParams: WithDemoParams): JobDefinition {
  return {
    id: "publicIp",
    label: "publicIp (listPublicIpAddresses)",
    dependsOn: [], // independent of the network chain - can run immediately
    run: async (hooks) => {
      const params = withDemoParams<Record<string, any>>("publicIp", {});
      const result = await runSyncJob("listPublicIpAddresses", () => callApi<ListPublicIpAddressesResponse>("listPublicIpAddresses", params), hooks);

      const freeIds = (result.publicipaddress ?? []).filter((ip) => ip.state === "Free").map((ip) => ip.id);
      if (freeIds.length === 0)
        throw new Error("No available public IP address (state=Free)");

      // When free public IPs exist, claim one for this deployment. 
      // Lock the IP so that other concurrent runs cannot use it. 
      // The claim is released in the rollback if this job fails, or after staticNat succeeds.
      return claimFreeIp(freeIds);
    },
    rollback: async (ipId) => {
      // Nothing was created at CloudStack - just release the IP locking for other concurrent runs.
      releaseIp(ipId);
    },
  };
}
