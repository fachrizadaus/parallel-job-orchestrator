import { callApi } from "../api";
import { ReplaceNetworkACLListParams, JobIdResponse } from "../api/types";
import { runAsyncJob, JobDefinition } from "../scheduler";
import { WithDemoParams } from "./index";

export function attachAclJob(withDemoParams: WithDemoParams): JobDefinition {
  return {
    id: "attachAcl",
    label: "attachAcl (replaceNetworkACLList)",
    dependsOn: ["aclList", "subnet"],
    run: async (hooks, ctx) => {
      const params = withDemoParams<ReplaceNetworkACLListParams>("attachAcl", {
        aclid: ctx.resources.aclList,
        networkid: ctx.resources.subnet,
      });

      const result = await runAsyncJob("replaceNetworkACLList", () => callApi<JobIdResponse>("replaceNetworkACLList", params), hooks);
      ctx.cloudJobIds.attachAcl = result.jobid;
      return "";
    },
  };
}
