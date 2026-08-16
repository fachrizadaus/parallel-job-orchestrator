/**
 * config.ts
 *
 * Every tunable constant, read from the environment (a local .env file) with a fallback if unset. 
 * Only BASE_URL is required, everything else has a default.
 * 
 * Uses Node's built-in process.loadEnvFile() (20.6+)
 */

import { resolve } from "node:path";

try {
  process.loadEnvFile(resolve(__dirname, "..", ".env"));
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
}

if (!process.env.BASE_URL) {
  throw new Error("BASE_URL is not set. Add it to your local .env (see .env.example)");
}
export const BASE_URL = process.env.BASE_URL;

// Set request timeout to 35 seconds by default, but allow override via .env.
export const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS ?? 35_000);

// Retry-on-timeout settings
export const DEFAULT_MAX_RETRIES = Number(process.env.DEFAULT_MAX_RETRIES ?? 3);
export const DEFAULT_POLL_INTERVAL_MS = Number(process.env.DEFAULT_POLL_INTERVAL_MS ?? 1000);

// Exponential backoff for retry-on-timeout
export const BACKOFF_BASE_MS = Number(process.env.BACKOFF_BASE_MS ?? 1000);
export const BACKOFF_CAP_MS = Number(process.env.BACKOFF_CAP_MS ?? 8000);
export const BACKOFF_JITTER_MS = Number(process.env.BACKOFF_JITTER_MS ?? 300);

// Logs every API request/response to a per-run file under logs/ when enabled.
export const CREATE_LOG = process.env.CREATE_LOG === "true";

// Values sent as API params that don't have a real per-environment meaning yet
// (service offering, template, subnet gateway/netmask, ACL rules) live in
// src/demo/fixtures.ts, not here - see that file for why.
