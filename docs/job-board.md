## Live Job Board
Instead of per-event log spam, the run renders one status table, one row per job. On a TTY it redraws in place ~2×/sec.

| state | job | attempt | start | end | elapsed | detail |
| --- | --- | --- | --- | --- | --- | --- |
| Done | `vpc (createVpc)` | | 21:08:44.076 | 21:08:51.533 | 7.5s | `jobid=db5dc157-07bd-47c9-8be0-9bf7506fd41c id=9a6b0410-748a-4b51-a652-be7471b84cc2` |
| Done | `subnet (createNetwork)` | | 21:08:51.533 | 21:08:51.579 | 0.0s | `id=efc83160-8e52-4754-8572-39b93f837d6d` |
| Done | `aclList (createNetworkACLList)` | | 21:08:51.534 | 21:08:57.901 | 6.4s | `jobid=62be4ebc-dbbf-4f3b-8786-55a9e18eab7b id=2961b291-5e5b-49f9-92ad-f3e7f59132b7` |
| Retrying | `attachAcl (replaceNetworkACLList)` | 2/4 | 21:08:57.902 | -- | 70.8s | timeout - next attempt in 1.9s |
| Waiting | `deployVm (deployVirtualMachine)` | | -- | -- | -- | needs: subnet |

*(On terminal it will be a plain aligned text table, redrawn in place.)*

The **job column** shows the internal job id and the actual CloudStack command a job calls, e.g. `subnet (createNetwork)`.

The **detail column**, once a job is `Done`, shows `jobid=<...>` (CloudStack's own async job-tracking id, from `queryAsyncJobResult`) alongside `id=<...>` (the actual resource id created). Sync commands have no CloudStack jobid at all - the API returns the resource directly with no polling - so their detail only shows `id=<...>`.

States: `Waiting` · `Running` · `Retrying` · `Done` · `Failed` · `Cancelled` (was idle in backoff sleep when a sibling failed, gave up early rather than firing another request) · `Skipped` (never became eligible before dispatch).

The **`attempt` column** is the retry attempt counter (`attempt/totalAttempts`). It stays blank on the single-attempt happy path and persists after the job ends, so a job that only succeeded on its 3rd attempt still says `3/4` in the final board. Retries are surfaced here rather than as log lines because the in-place redraw would erase anything printed below the table; on piped output there's no live redraw, so the plain `Timeout on "...", retrying in ...` warning is logged instead.