/**
 * api/client.ts
 *
 * The engine: how we talk to the CloudStack API. Builds the URL, sends
 * the request with a timeout, unwraps the `<command>response` envelope, and
 * classifies whatever comes back into a real answer or a typed error.
 */

import { BASE_URL, REQUEST_TIMEOUT_MS } from "../config";
import { ApiTimeoutError, ApiCommandError } from "../errors";
import { logLine } from "../logger";

function toStringRecord(params: Record<string, string | number | boolean>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) out[k] = String(v);
  return out;
}

function isErrorShape(unwrapped: any): boolean {
  return unwrapped && typeof unwrapped === "object" && ("errorcode" in unwrapped || "errortext" in unwrapped);
}

/**
 * registering hook that can rewrite outgoing params before a request is sent. 
 */
export type RequestInterceptor = (ctx: {
  jobId?: string;
  attempt?: number;
  command: string;
  params: Record<string, string | number | boolean>
}) => Record<string, string | number | boolean>;


let interceptor: RequestInterceptor | undefined;
export function setRequestInterceptor(fn: RequestInterceptor | undefined): void {
  interceptor = fn;
}

// Calls the API and unwraps the `<command>response` envelope.
// `meta` (jobId/attempt) is only used to look up for active interceptor, if any - see setRequestInterceptor above.
export async function callApi<T = any>(
  command: string,
  params: Record<string, string | number | boolean> = {},
  meta?: { jobId?: string; attempt?: number }
): Promise<T> {
  // If an interceptor is registered, then rewrite the params before sending the request.
  if (interceptor) params = interceptor({ ...meta, command, params });

  const query = new URLSearchParams({ command, response: "json", ...toStringRecord(params) });
  const url = `${BASE_URL}?${query.toString()}`;
  logLine(`-> ${url}`);

  let res: Response;
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    res = await fetch(url, { signal: controller.signal });
  } catch (err) {
    // Connection failure or our own timeout abort - both are retryable.
    logLine(`   fetch threw: ${err instanceof Error ? err.message : err}`);
    throw new ApiTimeoutError(command);
  } finally {
    clearTimeout(timeoutHandle);
  }

  const text = await res.text();

  if (!res.ok) {
    logLine(`   HTTP ${res.status} ${res.statusText} <- ${text}`);
    throw new ApiTimeoutError(command);
  }

  let body: Record<string, any>;
  try {
    body = JSON.parse(text);
  } catch (err) {
    logLine(`   response was not valid JSON <- ${text}`);
    throw new ApiTimeoutError(command);
  }

  logLine(`<- ${text}`);

  const unwrapped = body[`${command.toLowerCase()}response`];
  if (!unwrapped) {
    throw new Error(`Unexpected response shape for command "${command}": ${JSON.stringify(body)}`);
  }

  if (isErrorShape(unwrapped)) {
    throw new ApiCommandError(command, unwrapped); // bad param etc - not retryable
  }

  return unwrapped as T;
}
