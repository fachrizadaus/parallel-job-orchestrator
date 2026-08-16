## Retry vs. failure
Not every problem talking to CloudStack means something is actually wrong — this orchestrator treats two situations differently.

**A timeout** is treated as "we don't actually know what happened." Maybe the request never reached CloudStack. Maybe CloudStack is just slow. Maybe the answer was on its way back and got lost. Since there's no way to tell which, the assumption is that it's worth trying again — so a timeout is always retried, waiting a little longer each time (see [Backoff strategy](#backoff-strategy-capped-exponential-backoff--fixed-width-jitter) below). This is handled by `withRetry()` in [`src/scheduler/retry.ts`](../src/scheduler/retry.ts).

This applies in two places:
- to the very first request that kicks a job off,
- to every later `queryAsyncJobResult` poll for a job that's still working in the background — both use the same `backoffDelay()`. 

By default, a timed-out request gets up to `DEFAULT_MAX_RETRIES` retries (4 attempts total) before the job is treated as a real failure.

**A real failure** (CloudStack responds with `jobstatus=2`, returned as `ApiJobFailedError`) means CloudStack actually looked at the request and rejected it — for example, because of a missing or invalid parameter. Retrying that would just produce the same rejection again, so it is never retried. The same applies to a request CloudStack rejects immediately in its response envelope (`ApiCommandError`), without ever attempting it.

### Backoff strategy: capped exponential backoff + fixed-width jitter

Each retry waits longer than the last, up to a cap, plus a small random amount on top. This is `backoffDelay()` in [`src/scheduler/retry.ts`](../src/scheduler/retry.ts):

```ts
capped = min(base * 2^(attempt-1), cap)   // 1s, 2s, 4s, 8s, 8s, 8s... (capped at 8s)
delay  = capped + random(0, 300ms)        // a small random amount on top, so retries don't all land at once
```

The random amount matters because jobs run in parallel — without it, several jobs that time out around the same moment would all retry at exactly the same instant, over and over, rather than spreading out.

`BACKOFF_BASE_MS`, `BACKOFF_CAP_MS`, and `BACKOFF_JITTER_MS` (all in `.env`, see `.env.example`) control the three inputs to formula above. With the defaults (base `1000`, cap `8000`, jitter `300`), the wait before each retry looks like:

| attempt | base wait | after the cap | actual wait |
| --- | --- | --- | --- |
| 1 | 1000ms | 1000ms | 1000–1300ms |
| 2 | 2000ms | 2000ms | 2000–2300ms |
| 3 | 4000ms | 4000ms | 4000–4300ms |
| 4 | 8000ms | 8000ms (capped) | 8000–8300ms |

*(For more on why jitter matters, see [this explainer on backoff and jitter](https://dev.to/biomousavi/understanding-jitter-backoff-a-beginners-guide-2gc#what-is-jitter).)*

### A known limitation: retrying isn't always risk-free
A timeout only means we stopped waiting for a response — it doesn't tell us whether CloudStack actually received and acted on the request. Three different things could be true when a request times out:
1. It never reached CloudStack at all — retrying is completely safe.
2. CloudStack received it and is still working on it — retrying sends a second, duplicate request.
3. CloudStack received it, finished, and the response was already on its way back when we gave up waiting — retrying definitely sends a duplicate.

There's no way to tell these apart from the outside, so every timeout is retried the same way — which means case 2 and case 3 can, in rare cases, end up creating something twice.

**A concrete example**, using the `vpc` job:

| time | what happens |
| --- | --- |
| t=0s | The request to create a VPC is sent |
| t=15s | No response yet — we give up waiting and mark it a timeout (in reality, CloudStack received it fine and is just slow; it finishes at t=18s and creates VPC "A") |
| t=15.6s | After waiting a bit, the same request is sent again |
| t=22s | CloudStack responds to the second request, having created a second VPC, "B" |

From here on, the orchestrator only knows about VPC "B" and, if needed, would undo later. VPC "A" was genuinely created by the first request, but the orchestrator has no record of it at all. If the run fails later and rolls back, only "B" gets deleted; "A" is left behind with nothing pointing to it.

This can't be fixed within what CloudStack's API offers here:
- There's no way to tell CloudStack "if you already handled a request like this, just give me the same answer instead of doing it again" — every retry looks like a brand-new request.
- There's also no way to first check "does something like this already exist?" before retrying — and even if there were, checking by name alone wouldn't be reliable, since two different runs could use the same name at the same time.

## Rollback
If a job fails for real (e.g. `jobStatus = 2`), the orchestrator can't just stop and leave things as is — it need to works backward through an in-memory `undoStack` and undoes everything that already succeeded.

- No new jobs are started once a failure happens (`stopDispatch = true`), but jobs already in progress are left to finish rather than being cut off mid-request. Cutting off request risks losing track of something CloudStack may have already created for it.
- Once everything has settled, every job that completed successfully is undone, popped off `undoStack` LIFO — most-recently-finished job first. That ordering matters: for example, a virtual machine is destroyed before the network it sits on is deleted, because CloudStack won't allow the network to be removed while something is still using it.
- If undoing a step itself fails, that resource is collected into `rollbackFailed` and called out at the end as something that still needs manual cleanup.
