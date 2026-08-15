import { callApi } from "../api";
import { CreateNetworkACLParams, JobIdResponse } from "../api/types";
import { runAsyncJob, JobDefinition } from "../scheduler";
import { WithDemoParams } from "./index";
import { ACL_RULE_PROTOCOL, ACL_RULE_CIDR, ACL_RULE_ACTION } from "../config";

export function aclRuleJob(withDemoParams: WithDemoParams): JobDefinition {
  return {
    id: "aclRule",
    label: "aclRule (createNetworkACL)",
    dependsOn: ["aclList"],
    run: async (hooks, ctx) => {
      const params = withDemoParams<CreateNetworkACLParams>("aclRule", {
        aclid: ctx.resources.aclList,
        protocol: ACL_RULE_PROTOCOL,
        cidrlist: ACL_RULE_CIDR,
        action: ACL_RULE_ACTION,
      });

      const result = await runAsyncJob("createNetworkACL", () => callApi<JobIdResponse>("createNetworkACL", params), hooks);
      ctx.cloudJobIds.aclRule = result.jobid;
      return result.jobresult.networkacl?.id ?? "";
    },
  };
}
