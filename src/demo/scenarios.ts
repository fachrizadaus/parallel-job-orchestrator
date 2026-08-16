/**
 * demo/scenarios.ts
 *
 * The curated set of scenarios available via `npm run demo:list` / `demo:run <name>`.
 *
 */

import { DemoScenario } from "./types";

export const SCENARIOS: DemoScenario[] = [
  {
    name: "no-public-ip",
    description: "Happy path, no public IP branch. (Positive)",
    publicIp: false,
    aclRulesetCount: 1,
  },
  {
    name: "with-public-ip",
    description: "Happy path, including static NAT on a public IP. (Positive)",
    publicIp: true,
    aclRulesetCount: 1,
  },
  {
    name: "multiple-acl-rules-at-once",
    description: "Several acl rules are set up at the same time instead of one after another. (Positive)",
    publicIp: false,
    aclRulesetCount: 3,
  },
  {
    name: "deployvm-outpaces-acl",
    description: "aclList is slowed by a retried timeout - deployVm (which only depends on subnet) finishes well before the ACL branch. (Positive)",
    publicIp: false,
    aclRulesetCount: 1,
    simulate: { aclList: { timeoutAttempts: 2 } },
  },
  {
    name: "deployvm-timeout-recovery",
    description: "deployVm times out twice, then succeeds on the third attempt. (Positive)",
    publicIp: false,
    aclRulesetCount: 1,
    simulate: { deployVm: { timeoutAttempts: 2 } },
  },
  {
    name: "deployvm-failure",
    description: "deployVm is rejected (jobstatus=2). By the time it fails, the rest of the pipeline should be completed. (Negative)",
    publicIp: true,
    aclRulesetCount: 1,
    simulate: { deployVm: { failNow: true } },
  },
  {
    name: "deployvm-timeout",
    description: "deployVm timeout on every attempt, exhausting retries before rolling back. (Negative)",
    publicIp: true,
    aclRulesetCount: 1,
    simulate: { deployVm: { alwaysTimeout: true } },
  },
  {
    name: "vpc-timeout-recovery-subnet-failure",
    description: "vpc recovers from a timeout, but subnet is rejected (jobstatus=2), rolling back the vpc. (Negative)",
    publicIp: true,
    aclRulesetCount: 1,
    simulate: { vpc: { timeoutAttempts: 1 }, subnet: { failNow: true } },
  },
];
