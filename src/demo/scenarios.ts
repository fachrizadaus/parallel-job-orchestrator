/**
 * demo/scenarios.ts
 *
 * The curated set of scenarios available via `npm run demo:list` / `demo:run <name>`.
 *
 */

import { DemoScenario } from "./types";

export const SCENARIOS: DemoScenario[] = [
  {
    name: "success-without-public-ip",
    description: "Happy path, no public IP branch.",
    publicIp: false,
  },
  {
    name: "success-with-public-ip",
    description: "Happy path, including static NAT on a public IP.",
    publicIp: true,
  },
  {
    name: "success-multi-acl-rule-fanout",
    description: "Happy path - however many rules are configured in ACL_RULES (src/demo/fixtures.ts) are created in parallel, and attachAcl waits for all of them.",
    publicIp: false,
  },
  {
    name: "success-deployvm-outpaces-acl-branch",
    description: "aclList is deliberately slowed by a retried timeout - deployVm (which only depends on subnet) finishes well before the ACL branch, proving jobs are dispatched independently, not in fixed waves.",
    publicIp: false,
    simulate: { aclList: { timeoutAttempts: 2 } },
  },
  {
    name: "success-deployvm-recovers-from-timeout",
    description: "deployVm times out twice, then succeeds on the third attempt.",
    publicIp: false,
    simulate: { deployVm: { timeoutAttempts: 2 } },
  },
  {
    name: "rolled-back-after-deploy-vm-failure",
    description: "deployVm is rejected outright (jobstatus=2). The most comprehensive rollback demo - by the time it fails, the rest of the pipeline has typically already completed.",
    publicIp: true,
    simulate: { deployVm: { failNow: true } },
  },
  {
    name: "rolled-back-after-deploy-vm-timeout",
    description: "deployVm times out on every attempt, exhausting retries before rolling back.",
    publicIp: true,
    simulate: { deployVm: { alwaysTimeout: true } },
  },
];
