/**
 * demo/index.ts
 *
 * Activates a demo scenario by registering a request interceptor
 * 
 */

import { setRequestInterceptor, RequestInterceptor } from "../api";
import { DemoScenario, JobSimulation } from "./types";

/**
 * Registers an interceptor that applies `scenario.simulate` to every outgoing request.
 */
export function activateScenario(scenario: DemoScenario | undefined): void {
  if (!scenario) {
    setRequestInterceptor(undefined);
    return;
  }

  const interceptor: RequestInterceptor = ({ jobId, attempt = 1, params }) => {
    const sim: JobSimulation | undefined = jobId ? scenario.simulate?.[jobId] : undefined;
    if (!sim) return params;

    if (sim.failNow) return { ...params, result: 2 };
    if (sim.alwaysTimeout) return { ...params, timeout: 35 };
    if (sim.timeoutAttempts && attempt <= sim.timeoutAttempts) return { ...params, timeout: 35 };

    return params;
  };

  setRequestInterceptor(interceptor);
}

export type { DemoScenario, JobSimulation } from "./types";
