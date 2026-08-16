## How it runs
Every job declares which other jobs it needs to finish first (`dependsOn`). Instead of running the job step by step, the scheduler starts a job the instant its own dependencies are done — it never makes a job wait on something unrelated just because that other job happens to be running at the same time.

For example, `aclRule` only needs `aclList` to be done. It does not wait for `subnet`, even though `subnet` becomes eligible to run around the same time — the two have nothing to do with each other.

| job | needs these done first | how it's undone if the run fails |
| ----------- | ---------------------- | -------------------------------------------------------------------------------------- |
| `vpc`       | *(nothing — starts immediately)* | deletes the VPC |
| `subnet`    | `vpc`                  | deletes the network |
| `aclList`   | `vpc`                  | (removed automatically when the VPC is deleted) |
| `aclRule`   | `aclList`              | (removed automatically when the VPC is deleted) |
| `attachAcl` | `aclList`, `subnet`    | (removed automatically when the VPC is deleted) |
| `deployVm`  | `subnet`               | destroys the virtual machine |
| `publicIp`  | *(nothing — starts immediately)* | releases its local claim on the IP (see [docs/local-ip-locking.md](local-ip-locking.md)) |
| `staticNat` | `deployVm`, `publicIp` | disassociates the public IP |

## Project Layout
| path | what it's for |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `src/index.ts`           | Where the program starts: reads the command-line flags, prints the final result, sets the exit code |
| `src/jobs/`              | One file per job — what it needs, what it does, and how to undo it if the run fails |
| `src/scheduler/index.ts` | The scheduler itself: decides what to run next, and undoes completed work if something fails |
| `src/scheduler/retry.ts` | Retrying a timed-out request, and asking CloudStack whether an in-progress job is done yet |
| `src/scheduler/types.ts` | The shared shapes every job is written against (what a job looks like, what it's given to work with) |
| `src/board/`             | The live status table shown while the run is in progress — `index.ts` draws it, `rows.ts` decides what each row says |
| `src/api/`               | How requests are actually sent to CloudStack and how responses are read |
| `src/errors/`            | The different ways a request can go wrong, and what each one means for retrying |
| `src/ipLock.ts`          | Stops two runs on the same machine from claiming the same public IP at the same time |
| `src/logger.ts`          | Optional: writes every request and response to a file for later review (`CREATE_LOG=true` in `.env`, off by default) |
| `src/config.ts`          | Every adjustable setting in one place, with defaults if `.env` doesn't set them |

## End-to-end process
Two diagrams, split for a reason: 
- The run's overall lifecycle — what `runJobs()` does from start to exit code. The second zooms into a *single* job's request/retry/poll cycle. 
- Runs independently, once per job, and several of them are in flight at the same time — it's not a step embedded in the first diagram, it's working in parallel.


### 1. The overall run
```mermaid
flowchart TD
    START(["npx ts-node src/index.ts [flags]"]) --> PARSE["parseArgs()\nreads --publicIp / --failAt / --timeoutAt"]
    PARSE --> BUILD["buildJobs()\nbuilds the job list (vpc, subnet, aclList, ...).\n--failAt/--timeoutAt inject demo params\ninto the matching job's request, to force\na failure or timeout on demand"]
    BUILD --> RUNJOBS["runJobs(jobs, ctx)\nsrc/scheduler/index.ts"]

    RUNJOBS --> LOOP["Dispatch loop: start every job whose\ndependsOn are all Done, wait for the\nnext one to settle (Promise.race), repeat.\n\nSee diagram 2 for what happens\ninside a single job."]

    LOOP -->|"Every job Done"| RETSUCCESS["returns\n{ success: true, completedJobs, ... }"]
    LOOP -->|"A job failed for real"| RETFAIL["Undo every completed job,\nmost-recently-finished first\n(the undoStack, popped LIFO),\nthen returns { success: false, ... }"]
    LOOP -->|"Jobs left over that never\nbecame eligible - a mistake in\ndependsOn, not a run-time failure"| THROWSTUCK["throws\n'Scheduler stuck: [...] never became eligible'"]

    RETSUCCESS --> MAINOK["main() prints the\nDeployment SUCCEEDED summary"]

    RETFAIL --> ROLLOK{"Did every\nundo call succeed?"}
    ROLLOK -->|Yes| MAINFAIL["main() prints the\nDeployment FAILED summary"]
    ROLLOK -->|No| MAINMANUAL["main() prints Deployment FAILED,\nplus a MANUAL CLEANUP REQUIRED list\nof what's still out there"]

    THROWSTUCK --> MAINCATCH["Uncaught - skips the formatted\nsummary entirely. main().catch()\nin index.ts prints a bare\n'Fatal error: ...' line instead"]

    MAINOK --> EXIT0(["exit code 0"])
    MAINFAIL --> EXIT1(["exit code 1"])
    MAINMANUAL --> EXIT1
    MAINCATCH --> EXIT1
```

### 2. One job's lifecycle
Every in-flight job is independently working through this same cycle. `withRetry()` and `pollJob()` (both in [`src/scheduler/retry.ts`](../src/scheduler/retry.ts)) own this logic; the dispatch loop above just awaits whichever job's promise finish first.

```mermaid
flowchart TD
    ELIGIBLE(["Job becomes eligible -\nevery job in their dependsOn is Done"]) --> SEND["job.run() sends the command\n(e.g. createVpc, createNetwork)"]

    SEND --> GOTRESPONSE{"Response within\nREQUEST_TIMEOUT_MS?"}
    GOTRESPONSE -->|No| RESEND["withRetry(): wait\n(exponential backoff + jitter),\nthen send the same command again"]
    RESEND -->|"up to DEFAULT_MAX_RETRIES times"| SEND
    RESEND -->|"retries exhausted"| TIMEOUTFAIL["Job fails: ApiTimeoutError"]

    GOTRESPONSE -->|Yes| KIND{"Sync or async command?"}

    KIND -->|"Sync"| SUCCEED

    KIND -->|"Async"| POLL["pollJob(): ask\nqueryAsyncJobResult(jobid)"]

    POLL --> POLLRESPONSE{"Response\nin time?"}
    POLLRESPONSE -->|No| RETRYPOLL["Wait (same backoff),\nthen ask again"]
    RETRYPOLL -->|"up to DEFAULT_MAX_RETRIES\nconsecutive timeouts"| POLL
    RETRYPOLL -->|"retries exhausted"| TIMEOUTFAIL

    POLLRESPONSE -->|Yes| JOBSTATUS{"jobstatus?"}
    JOBSTATUS -->|"0 - still processing"| POLL
    JOBSTATUS -->|"1 - succeeded"| SUCCEED["Job succeeds - resourceId is\nrecorded; if this job declares a\nrollback fn, it's pushed onto the undoStack"]
    JOBSTATUS -->|"2 - really failed"| REALFAIL["Job fails: ApiJobFailedError -\nNOT retried, CloudStack genuinely\nrejected this request"]

    SUCCEED --> DONE(["Outcome reported back\nto the dispatch loop"])
    TIMEOUTFAIL --> DONE
    REALFAIL --> DONE
```

**What this means in practice:**

- **Jobs run in parallel wherever `dependsOn` allows it.** The moment any job settles, the dispatch loop immediately checks what's newly unblocked and starts it.
- **A timeout is always retried** — both the initial `job.run()` call and every later `queryAsyncJobResult` poll go through the same backoff logic. A real `jobstatus=2` failure is different: CloudStack actually looked at the request and rejected it, so retrying would just get the same rejection again.
- **On a real failure, nothing already in flight is cut off mid-request.** New jobs stop being dispatched, but anything already running is left to finish, so a resource CloudStack already started creating will always tracked.
- **The run ends one of three ways:** 
  - every job succeeds; 
  - a job fails for real and everything already completed gets undone via `undoStack`, most-recently-finished first; 
  - or — separately, and not really a "failure" — some jobs are left with dependencies that can never resolve, which `runJobs()` treats as a thrown error rather than a normal result.
