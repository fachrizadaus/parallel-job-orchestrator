/**
 * demo/fixtures.ts
 *
 * Fixed values sent as API params that this fake CloudStack instance needs.
 * 
 */

import type { AclRuleConfig } from "../api/types";

export const SERVICE_OFFERING_ID = "testserviceoffering";
export const TEMPLATE_ID = "testtemplate";

// SUBNET_GATEWAY must fall inside VPC_CIDR - both describe the same address space.
export const VPC_CIDR = "10.0.0.0/16";
export const SUBNET_GATEWAY = "10.0.1.1";
export const SUBNET_NETMASK = "255.255.255.0";

// One createNetworkACL call (and one job) per entry, all created in parallel -
// see src/jobs/aclRule.ts. Three rules (not one) so success-multi-acl-rule-fanout
// demonstrates actual parallel dispatch, not a trivially single-job "parallel" set.
export const ACL_RULES: AclRuleConfig[] = [
  { protocol: "tcp", cidr: "0.0.0.0/0", action: "Allow", startport: "22", endport: "22" },
  { protocol: "tcp", cidr: "0.0.0.0/0", action: "Allow", startport: "80", endport: "80" },
  { protocol: "tcp", cidr: "0.0.0.0/0", action: "Allow", startport: "443", endport: "443" },
];
