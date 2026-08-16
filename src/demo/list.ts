/**
 * demo/list.ts
 *
 * `npm run demo:list` -> prints every scenario name and description, so user knows what's available to run.
 * 
 */

import { SCENARIOS } from "./scenarios";

const width = Math.max(...SCENARIOS.map((s) => s.name.length));

console.log(`${SCENARIOS.length} demo scenarios available. Run one with:\n  npm run demo:run -- <name>\n`);
for (const s of SCENARIOS) {
  console.log(`  ${s.name.padEnd(width)}  ${s.description}`);
}
