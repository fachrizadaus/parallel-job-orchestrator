/**
 * ipLock.ts
 *
 * Local, filesystem-based exclusion for public IP selection.
 *
 * listPublicIpAddresses() then enableStaticNat() is a check-then-act race.
 * Two runs on this machine could pick the same "Free" IP and both
 * report success while only one VM is actually reachable through it. 
 * This ipLock module ensures that only one run on this machine can claim a given IP at a time.
 */

import * as fs from "node:fs";
import * as path from "node:path";

const LOCK_DIR = path.resolve(__dirname, "..", ".ip-locks");

// A lock older than this is treated as abandoned even if its owning process is still alive. 
// This is a safety-net in case a run crashes or is killed and never releases its lock.
const STALE_LOCK_MS = 15 * 60 * 1000;

interface LockContents {
  pid: number;
  claimedAt: number;
}

function lockPath(ipId: string): string {
  return path.join(LOCK_DIR, `${ipId}.lock`);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false; // ESRCH - no such process
  }
}

/**
 * True if an existing lock is safe to take over 
 * (i.e. the process that created it is dead/gone, or the lock is old enough to assume abandoned).
 */
function isStale(existing: LockContents): boolean {
  if (Date.now() - existing.claimedAt > STALE_LOCK_MS) return true;
  return !isProcessAlive(existing.pid);
}

function tryClaim(ipId: string): boolean {
  fs.mkdirSync(LOCK_DIR, { recursive: true });
  const contents: LockContents = { pid: process.pid, claimedAt: Date.now() };

  try {
    fs.writeFileSync(lockPath(ipId), JSON.stringify(contents), { flag: "wx" });
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
  }

  // Lock file already exists - see if it's actually abandoned.
  let existing: LockContents;
  try {
    existing = JSON.parse(fs.readFileSync(lockPath(ipId), "utf8"));
  } catch {
    existing = { pid: -1, claimedAt: 0 }; // unreadable/corrupt - treat as stale
  }
  if (!isStale(existing)) return false;

  // Another process could win this exact race too,
  // in which case our write below just fails EEXIST and we report "not
  // claimed" rather than risking a double-claim.
  try {
    fs.rmSync(lockPath(ipId));
    fs.writeFileSync(lockPath(ipId), JSON.stringify(contents), { flag: "wx" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Given the CloudStack-reported "Free" IP ids, claim the first one this process can get a local lock on. 
 * Falls through to the next candidate if one is already locked by another local run - only throws once every 
 * candidate is taken.
 */
export function claimFreeIp(candidateIds: string[]): string {
  for (const id of candidateIds) {
    if (tryClaim(id)) return id;
  }
  throw new Error(
    `No available public IP - all ${candidateIds.length} "Free" IP(s) reported by ` +
    `the API are already claimed by other local runs in progress.`
  );
}

/**
 * Release a claimed IP so other local runs can pick it up.
 */
export function releaseIp(ipId: string): void {
  try {
    fs.rmSync(lockPath(ipId));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
