# Decision Log

## 001: Use PostgreSQL as the queue instead of Redis/BullMQ

**Decision**
Store and manage jobs directly in PostgreSQL, using `FOR UPDATE SKIP LOCKED` for safe job claiming.

**Why**
- **Fewer moving parts:** the system already needs a database. Using it as the queue avoids running and monitoring a second service.
- **Durability:** PostgreSQL writes data to disk, so jobs survive restarts and crashes. Redis keeps data in memory by default and can lose recent jobs if it crashes.
- **Transactional safety:** a job can be created in the same transaction as the data it belongs to (for example, an order and its "send confirmation" job). Either both are saved or neither is. With a separate Redis queue, the order could be saved while the job is lost.
- **Enough for this scale:** `SKIP LOCKED` lets many workers claim jobs without blocking each other, which is enough for most applications.
- **Understanding:** building claiming, retries, and crash recovery myself shows how job queues work internally, instead of relying on a library to hide it.

**Trade-offs**
- **Lower peak speed:** Redis works in memory and is faster at very high volumes. PostgreSQL is slower because it writes to disk.
- **Extra database load:** workers regularly check the database for new jobs, which adds queries even when the queue is empty.
- **More to build and maintain:** features that BullMQ already provides (retries, dashboards, rate limits) must be built and tested by hand, with more room for bugs.

## 002: Set a connection timeout on the database pool

**Decision**
Set `connectionTimeoutMillis: 5000` on the PostgreSQL connection pool.

**Why**
- By default, `pg` uses `0`, which means a request for a connection waits forever.
- If all connections are busy or leaked (for example, a missing `release()`), the code would freeze silently with no error and no log.
- With a 5 second limit, the request fails with a clear error instead, so the problem is visible and easy to debug.

**Trade-off**
- If the database is only slow (not broken), a request that would have succeeded after 6 seconds now fails.
- 5 seconds is chosen as a balance: long enough for normal delays, short enough to catch real problems quickly.


## 003: API design for creating jobs

**Decisions**
- `POST /jobs` accepts `type`, `payload`, `runAt`, `maxAttempts`. System fields (`status`, `attempts`, locks) cannot be set by the caller.
- Any job `type` string is accepted. Workers mark jobs with an unknown type as `failed` immediately, without retries.
- A `runAt` in the past is accepted and the job runs as soon as possible. Invalid dates are rejected with 400.
- `maxAttempts` defaults to 5, allowed range 1 to 10.
- API uses camelCase (`runAt`), database uses snake_case (`run_at`). Conversion happens in one place.
- Request body limited to 64 KB.

**Why**
- Accepting any type keeps the API independent from the workers, which may be deployed separately.
- Unknown types are a permanent error, so retrying them only wastes time.
- Limiting attempts stops broken jobs from retrying almost forever and adding load.
- Payloads are read on every claim, so large payloads slow the whole queue. Jobs should carry references (like a file ID), not large data.

**Trade-offs**
- A typo in `type` is only detected when a worker picks up the job, not when the job is created.
- Callers needing large data must store it elsewhere and pass a reference.

## 004: Worker design

**Decisions**
- Claim a job with a single `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING *`.
- Commit the claim immediately, then run the handler outside any transaction, then update the job's status in a separate query.
- When no job is due, the worker sleeps 1 second before checking again.
- Each worker identifies itself as `hostname-pid` in `locked_by`.

**Why**
- A single statement is atomic by itself and needs one round trip, with no manual transaction handling.
- Running handlers outside the transaction keeps transactions short, so slow jobs do not hold row locks or database connections.
- A 1 second idle sleep keeps database load low while new jobs still start within about a second.
- `hostname-pid` is unique per process and container, so `locked_by` shows exactly which worker held a job.

**Trade-offs**
- If a worker crashes after claiming, the job stays `running` until lease expiry is added (Phase 5).
- Each idle worker adds one query per second to the database.

## 005: Retry policy

**Decisions**
- A failed job is retried by setting it back to `waiting` with `run_at` in the future. No extra status or column.
- Delay is exponential: 5s base, doubling per attempt, capped at 300 s.
- Jitter is proportional: a random 0 to 20% is added to each delay.
- Handlers throw `PermanentError` for failures that can never succeed. These fail immediately. Every other error is retried.
- A job is marked `failed` when its attempts reach `max_attempts`.
- The worker computes the delay in seconds, the database sets the time with `now() + delay`.

**Why**
- Reusing `run_at` means the claim query needs no change: it already skips jobs that are not due.
- Backoff gives a failing service time to recover. The cap stops a job from waiting long after the service is healthy again.
- Proportional jitter keeps retries spread out even at long delays, where a few fixed seconds would not.
- Retrying by default is the safe choice: a forgotten `PermanentError` wastes attempts, but never loses a job.

**Trade-offs**
- Hopeless jobs not marked permanent use all their attempts before failing.
- With the cap, late retries hit a still-broken service every 5 minutes instead of backing off further.

## 006: Recurring jobs

**Decisions**
- A recurring job is a row in a `schedules` table (cron expression, job type, payload, `next_run_at`). The scheduler creates normal jobs from it. Workers are unchanged.
- The scheduler is a separate process and can run as multiple instances.
- A due schedule is claimed with `FOR UPDATE SKIP LOCKED`.
- Inserting the job and advancing `next_run_at` happen in one transaction.
- Missed runs are not replayed: after downtime, one job is created and the schedule continues from the next future time.
- Cron expressions are evaluated in UTC.

**Why**
- Row locking stops two schedulers from creating the same job twice.
- One transaction means a crash can never produce a duplicate job or a skipped run.
- Because the queue is in PostgreSQL, the job insert and the schedule update can share a transaction.
- Replaying missed runs would flood the queue with outdated work after an outage.

**Trade-offs**
- Schedules that need every single run (for example billing) would lose runs during downtime.
- Times are UTC, so callers must convert from local time.

## 007: Crash recovery

**Decisions**
- A claim is a lease: `locked_until` is set 30 seconds ahead when a job is claimed.
- A reaper step finds `running` jobs whose lease has expired. Jobs with attempts left go back to `waiting`. Jobs with none are marked `failed`.
- The reaper is its own module but is called from each worker's loop every few seconds, not run as a separate program.
- While a job runs, the worker sends a heartbeat every 10 seconds that extends the lease.
- `attempts` is increased at claim time, not at completion.

**Why**
- A separate reaper keeps the claim query simple and handles exhausted jobs, which a claim query cannot.
- Running the reaper inside workers means no extra process to deploy, and recovery works whenever at least one worker is alive. It is a single UPDATE, so several workers running it at once is safe.
- A heartbeat at one third of the lease survives two late or missed heartbeats before the lease expires.
- Counting attempts at claim time means a job that crashes its worker still uses up attempts and eventually fails, instead of looping forever.

**Trade-offs**
- A crashed worker's job waits up to the lease length (30 s) before it is recovered.
- A job can run twice if a worker is alive but its heartbeats stop (for example a blocked event loop). Handlers must be idempotent.
- A crash that is not the job's fault still costs that job an attempt. A separate crash counter could be added later.

**Weakness Known weaknesses (measured in Phase 5d):**

- A job that crashes its worker uses one full attempt per crash, so with the
  default of 5 attempts it can crash 5 workers before it is marked failed.
  A separate crash counter with a lower limit would fix this. Not built.
- The reaper requeues a job without any delay, so retry backoff (decision 005)
  does not apply to crashes. The only delay is the lease time (30 s).

## 008: Running workers in containers

Decision:
- The worker runs from its own Docker image. The API and scheduler stay on the laptop for now.
- Secrets are not in the image. `.env` is excluded with `.dockerignore`, and
  `DATABASE_URL` is passed in as an environment variable when the container starts.
- Inside the Compose network the worker reaches the database at host `postgres`
  (the service name), not `localhost`.
- The container starts with `node src/worker/worker.js`, not `npm run worker`,
  because the npm script expects a `.env` file.
- Worker id stays `hostname-pid`. In a container the pid is usually 1 and the
  hostname is the container id, so the id is still unique per container.

Why:
- An image can be shared or pushed to a registry. A password inside it is leaked.
- `localhost` inside a container is the container itself.

Trade-off:
- There are now two ways to start a worker (laptop and container) with two
  different `DATABASE_URL` values. This is extra setup to keep in sync.


## 009: Graceful shutdown

Context:
Measured before this change: `docker compose stop worker` ends with exit code 137
(forced kill). The worker runs as process 1 in the container and ignores SIGTERM,
so a running job is cut, waits for its lease to expire, and is run again.

Decision:
- The worker listens for SIGTERM (docker stop) and SIGINT (Ctrl + C).
- On the signal it stops claiming new jobs.
- If idle, it exits right away.
- If running a job, it waits up to 20 seconds for the job to finish.
  - Finished in time: recorded as normal (done, retry, or failed).
  - Not finished: the job is released back to `waiting` with `attempts - 1`,
    then the worker exits.
- Docker Compose gives the worker 30 seconds (`stop_grace_period`) before a forced kill.
- The database pool is closed before exit.

Why:
- Deploys and restarts happen often. They should not cost a lease wait, a rerun,
  or one of the job's attempts.

Trade-offs:
- A job released after 20 s loses the work it did so far and starts again on another worker.
- Lowering attempts on release means a job that is released on every deploy never
  runs out of attempts from that cause. This is intended.
- If the worker is killed before it can release the job, the reaper still recovers it (decision 007).

## 010: Webhook delivery

Decision:
- A job can have an optional `callbackUrl`.
- When the job reaches a final state (`done`, or `failed` with no retry), the worker
  inserts a new job of type `deliver_webhook` with the URL, job id and final status.
- No webhook is sent for a failure that will be retried.
- The status update and the webhook job insert happen in one transaction (outbox pattern).
- The `deliver_webhook` handler sends an HTTP POST:
  - Timeout 10 s.
  - Any 2xx response = delivered. Anything else, or a timeout = error, normal retry.
- `deliver_webhook` jobs get `max_attempts = 10`, which covers about 20 minutes with the
  backoff from decision 005.

Why:
- Delivery reuses the queue: retries, backoff, leases, reaper and graceful shutdown,
  with no new retry code.
- A webhook failure never re-runs the original job.
- The transaction makes sure a finished job always has its webhook queued.

Trade-offs:
- At-least-once: if the worker crashes after the HTTP call succeeded but before marking
  the webhook job done, the shop receives it twice. Receivers must handle duplicates.
- A receiver down for more than about 20 minutes misses the webhook.
- Requests are not signed yet (next step).

## 011: Webhook signing

Decision:
- Every webhook request carries two headers:
  - `X-Webhook-Timestamp`: Unix time in seconds when the request was sent
  - `X-Webhook-Signature`: `sha256=` + hex HMAC-SHA256 of `timestamp + "." + body`
- The secret comes from `WEBHOOK_SECRET` in the environment. It is never sent.
- The signature is calculated at send time, so every retry has a fresh timestamp.
- Receivers should recompute the signature, compare it in constant time, and reject
  requests older than 5 minutes.

Why:
- A signature proves the body was not changed and came from someone with the secret,
  without the secret ever appearing in requests or logs.
- The signed timestamp stops replaying an old request.

Trade-offs:
- One secret for all receivers. Anyone who holds it can sign requests, so the
  system is single-tenant. Per-client secrets need accounts and API keys, which are
  out of scope.
- Receivers must keep their clock roughly correct for the 5 minute window.

## 013: Strict runAt format with a required timezone

**Context**
`validateJob` used `new Date(runAt)` and only rejected `Invalid Date`. A unit test showed that JavaScript's date parser is far too loose:
- `"hello 5"` becomes 1 May 2001, so the job is stored in the past and runs immediately.
- `"1"` becomes 1 Jan 2001.
- `"2026-02-30T10:00:00Z"` silently rolls over to 2 March 2026.

None of these were rejected. The API returned 201.

**Decision**
`runAt` must match strict ISO 8601: `YYYY-MM-DDTHH:MM`, optional `:SS` and `.mmm`, then `Z` or an offset like `+05:00`. The check lives in `src/utils/isIsoDate.js` and runs in three stages:
1. The shape must match the pattern exactly.
2. `new Date()` must not return `Invalid Date` (catches month 13, hour 25).
3. The day must exist in that month (catches Feb 30 and Feb 29 in non-leap years).

A timezone is required. Without one, `"2026-10-01T10:00:00"` means 10:00 in the server's local timezone. A worker on a laptop (UTC+5) and one in Docker (UTC) would read the same request 5 hours apart, so rejecting it is safer than guessing.

**Trade-offs**
- Clients that sent dates without a timezone, or date-only strings like `"2026-10-01"`, now get a 400. This is a breaking change, accepted because the old behaviour was silently wrong.
- Leap seconds and years before 0000 are not supported. Neither matters for scheduling jobs.

**Found by:** the `rejects: runAt is random text` unit test (Phase 9).

## 014: Test strategy

**Decision**
- Node's built-in `node:test` runner. No test framework dependency.
- Tests run against a **real Postgres**, not mocks. The queue's correctness lives in SQL (`SKIP LOCKED`, lease checks, the outbox), and a mock would only test my guess of how Postgres behaves.
- A separate `jobs_test` database. The test helper refuses to run unless the database name ends in `_test`, because tests run `TRUNCATE`.
- `--test-concurrency=1`, so DB test files never wipe tables under each other.
- GitHub Actions runs the full suite on every push against a Postgres 17 service container. Migrations run with `ON_ERROR_STOP=1`, so a broken migration fails the build.

**Trade-offs**
- Running tests needs Postgres. Locally that's the existing Docker container, and in CI a service container.
- Not covered by automated tests: the worker loop end to end (heartbeat, graceful shutdown on SIGTERM, the shutdown timeout), real HTTP webhook delivery, and multi-container crash recovery. These are covered by the manual tests recorded in `docs/test-results.md`.

**Bugs found by the suite**
1. `new Date()` accepted strings like `"hello 5"` (as 2001), so bad `runAt` values scheduled jobs to run immediately. Fixed with a strict ISO check (decision 013).
2. The reaper failed lease-expired jobs with a plain UPDATE that skipped the outbox, so their webhooks never fired. Fixed with a data-modifying CTE (addendum to decision 010).