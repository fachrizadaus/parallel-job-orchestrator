# VM Deployment Orchestrator

## Solution
This project turns CloudStack VM deployment pipeline into a single CLI run: it models the deploy as a **dependency graph scheduling**, dispatches every job the instant its own dependencies are satisfied, retries transient timeouts with backoff, and — if any job genuinely fails — rolls back everything already completed, in reverse order, automatically.

## Features
- **Dependency-graph scheduling, not a fixed script** — independent jobs run in parallel, each dispatched the instant its own dependencies are satisfied.
- **Retry with exponential backoff + fixed-width jitter** — timeouts are retried automatically; genuine failures (`jobstatus=2`) never retried.
- **Rollback on failure, in reverse completion order** — nothing already sent to the API is cancelled mid-call; anything that can't be undone is reported as MANUAL CLEANUP REQUIRED.
- **Local IP-claim locking** to close a check-then-act race between `listPublicIpAddresses` and `enableStaticNat`.
- **No cron, no HTTP client library, no database** — native `fetch`, dependency-driven dispatch, an in-memory undo stack.

## Resources
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

Everything else in `.env` is optional — request timeouts, retry/backoff tuning, and the deployment parameters (service offering, template, subnet gateway/netmask, ACL rule defaults) all have built-in fallbacks; see [`.env.example`](.env.example) for the full list.

Set `CREATE_LOG=true` to log every API request/response to a per-run file under `logs/`. Off by default.

## Running the demo
```bash
npm run demo:public-ip      # happy path, publicIp=true
npm run demo:no-public-ip   # happy path, publicIp=false
npm run demo:fail           # forces deployVm to hard-fail -> triggers rollback
npm run demo:timeout        # forces deployVm to time out  -> retry/backoff, then rollback
```

Or run directly with `npx ts-node` to control every flag:

```bash
npx ts-node src/index.ts --publicIp=true
npx ts-node src/index.ts --publicIp=true --failAt=deployVm
npx ts-node src/index.ts --publicIp=true --timeoutAt=aclList
```

| flag | value | meaning |
| --- | --- | --- |
| `--publicIp` | `true`\|`false` | include the public IP branch (default: `true`) |
| `--failAt` | `<jobId>` | simulate `jobstatus=2`, a real failure. **Not** retried — rolls back immediately |
| `--timeoutAt` | `<jobId>` | simulate a request timeout. Retried with exponential backoff, then rolls back |

Valid job ids for `--failAt` / `--timeoutAt`: `vpc`, `subnet`, `aclList`, `aclRule`, `attachAcl`, `deployVm`, `publicIp`, `staticNat`.