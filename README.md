# VM Deployment Orchestrator

## Solution
This project turns CloudStack VM deployment pipeline into a single CLI run: it models the deploy as a **dependency graph scheduling**, dispatches every job the instant its own dependencies are satisfied, retries transient timeouts with backoff, and — if any job genuinely fails — rolls back everything already completed, in reverse order, automatically.

## Features
- **Dependency-graph scheduling, not a fixed script** — independent jobs run in parallel, each dispatched the instant its own dependencies are satisfied.
- **Retry with exponential backoff + fixed-width jitter** — timeouts are retried automatically; genuine failures (`jobstatus=2`) never retried.
- **Rollback on failure, in reverse completion order** — nothing already sent to the API is cancelled mid-call; anything that can't be undone is reported as MANUAL CLEANUP REQUIRED.
- **Local IP-claim locking** to close a check-then-act race between `listPublicIpAddresses` and `enableStaticNat`.
- **No cron, no HTTP client library, no database** — native `fetch`, dependency-driven dispatch, an in-memory undo stack.

## Documentation on how this app works
- [docs/end-to-end-recap.md](docs/end-to-end-recap.md) for how the code executes, the job table, and repo layout
- [docs/retry-and-rollback.md](docs/retry-and-rollback.md) for retry/backoff/rollback details (including the jitter strategy)
- [docs/local-ip-locking.md](docs/local-ip-locking.md) for the IP-claim lock.
- [docs/job-board.md](docs/job-board.md) for the live status table

## Requirements
- **Node.js 20.6+** 
- **npm**

## Setup
```bash
npm install
cp .env.example .env
```

Then set `BASE_URL` in `.env` to the fake CloudStack endpoint. The app will fail with a clear error if it's missing.

Everything else in `.env` is optional — request timeouts and retry/backoff tuning have built-in fallbacks; see [`.env.example`](.env.example) for the full list. `.env` only holds settings for *this app* (endpoint, timeouts, retries) 

Set `CREATE_LOG=true` to log every API request/response to a per-run file under `logs/`. Off by default.

## Running a demo scenario
This is how to run this project.

```bash
npm run demo:list             # see every available scenario and what it does
npm run demo:run -- <name>    # run one, e.g.: with-public-ip
```

### Provided Scenario to Run
| scenario | result | what it shows |
| --- | --- | --- |
| `no-public-ip` | positive | Happy path, no public IP branch. **(contest case: `public_ip=false`)** |
| `with-public-ip` | positive | Happy path, including static NAT on a public IP. **(contest case: `public_ip=true`)** |
| `multiple-acl-rules-at-once` | positive | Several acl rules are set up at the same time instead of one after another. |
| `deployvm-outpaces-acl` | positive | `aclList` is deliberately slowed; `deployVm` finishes well before it - proves jobs dispatch independently, not in fixed waves. |
| `deployvm-timeout-recovery` | positive | `deployVm` times out twice, then succeeds on the third attempt - retry/backoff recovering mid-run. |
| `deployvm-failure` | negative | `deployVm` rejected outright (`jobstatus=2`) - the most comprehensive rollback demo. **(contest case: a job failed)** |
| `deployvm-timeout` | negative | `deployVm` times out on every attempt, exhausting retries before rolling back. **(contest case: a job failed)** |
| `vpc-timeout-recovery-subnet-failure` | negative | `vpc` recovers from a timeout, but `subnet` is then rejected outright (`jobstatus=2`), rolling back the `vpc`. |
