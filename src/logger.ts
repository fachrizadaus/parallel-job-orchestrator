/**
 * logger.ts
 *
 * Optional file logging of every API request/response, enabled via
 * CREATE_LOG=true in .env. One file per process run under logs/, named by
 * start time. Disabled by default.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { CREATE_LOG } from "./config";

const LOG_DIR = path.resolve(__dirname, "..", "logs");
const LOG_FILE = path.join(LOG_DIR, `run-${Date.now()}.log`);

if (CREATE_LOG) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/** Appends one timestamped line to this run's log file. No-op if CREATE_LOG is unset. */
export function logLine(text: string): void {
  if (!CREATE_LOG) return;
  fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${text}\n`);
}
