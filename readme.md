# Distributed Background Job Processing System

A backend system that runs background jobs across multiple workers, built on Node.js and PostgreSQL. Jobs are stored in PostgreSQL and claimed with row-level locking, so the same job is never picked up by two workers at once. Failed jobs retry with backoff, and recurring jobs run on cron schedules.

**Status:** in active development. Phases 0 to 6 of 9 are complete. See [Roadmap](#roadmap).

## Features

- REST API to create and inspect jobs, with input validation
- Multiple workers sharing one queue with no duplicate processing (`FOR UPDATE SKIP LOCKED`)
- Automatic retries with exponential backoff and jitter
- Permanent errors skip retries; jobs that run out of attempts are kept with their last error
- Delayed jobs (`runAt`)
- Recurring jobs from cron expressions, safe to run with several scheduler instances
- On SIGTERM a worker finishes its current job, or releases it after 20 s, and exits cleanly
- Versioned SQL migrations

## Architecture

Three separate programs share one PostgreSQL database:

```
  API (Express)          Scheduler               Workers (1..n)
  POST /jobs             cron schedules          claim, run, retry
       |                      |                        ^
       v                      v                        |
  +-----------------------------------------------------------+
  |                       PostgreSQL                          |
  |        jobs table (the queue)   schedules table           |
  +-----------------------------------------------------------+
```

- **API** accepts jobs and schedules.
- **Scheduler** turns due schedules into normal jobs.
- **Workers** claim jobs, run the matching handler, and record the result.

They never call each other. PostgreSQL is the only shared state.

## How claiming works

Each worker claims a job with a single atomic statement:

```sql
UPDATE jobs
SET status = 'running', attempts = attempts + 1, locked_by = $1, ...
WHERE id = (
  SELECT id FROM jobs
  WHERE status = 'waiting' AND run_at <= now()
  ORDER BY run_at, id
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
RETURNING *;
```

A row locked by one worker is skipped by the others, so workers never wait on each other and never take the same job.

## Tech stack

Node.js, Express, PostgreSQL 17, Docker Compose, node-postgres (`pg`), cron-parser. No ORM and no external queue: building the queue on PostgreSQL is the point of the project.

## Getting started

Requirements: Node.js 20 or higher, Docker.

```bash
git clone https://github.com/basitalilabs/distributed-job-processor.git
cd distributed-job-processor
npm install
```

Copy `.env.example` to `.env` and set a password, then:

```bash
docker compose up -d      # start PostgreSQL
npm run migrate           # create tables
npm run dev               # API on port 3000
npm run worker            # in a second terminal (run more for more workers)
npm run scheduler         # in a third terminal
```

## API

| Method | Path | Description |
|---|---|---|
| GET | `/health` | API and database status |
| POST | `/jobs` | Create a job |
| GET | `/jobs/:id` | Get a job's status and details |
| POST | `/schedules` | Create a recurring schedule |
| GET | `/schedules` | List schedules |

Create a job:

```json
POST /jobs
{
  "type": "send_email",
  "payload": { "to": "user@example.com" },
  "runAt": "2026-12-01T10:00:00Z",
  "maxAttempts": 5
}
```

Only `type` is required. Create a schedule (cron times are UTC):

```json
POST /schedules
{
  "name": "daily-report",
  "cron": "0 2 * * *",
  "jobType": "send_email",
  "payload": { "to": "team@example.com" }
}
```

  ### Run workers in Docker
```
  docker compose up -d --build --scale worker=2
  docker compose logs -f worker
```

## Test results

| Test | Result |
|---|---|
| 30 jobs, 3 workers | every job processed exactly once, verified in SQL |
| 1 worker vs 3 workers | 31.7 s vs 11.05 s (2.87x faster) |
| Job fails twice, then succeeds | retried after about 5 s and 10 s, done on attempt 3 |
| Scheduler started 28 hours late | 1 job created, missed runs not replayed |
| Two schedulers | exactly 1 job per minute, second took over when the first stopped |

Jobs in these tests are simulated (about 1 second each). Details and limits are in [docs/test-results.md](docs/test-results.md).

## Design decisions

The reasoning and trade-offs behind each choice are in [docs/decisions.md](docs/decisions.md), including why PostgreSQL instead of Redis, the retry policy, and how recurring jobs avoid duplicates.

## Known limitations

- A job that crashes its worker uses one attempt per crash and is retried without backoff.
- Crash recovery is tested with containers on one host, not on separate machines.
- Workers stop immediately on Ctrl+C. Graceful shutdown is planned.
- Handlers are simulated. A real webhook delivery handler is planned.
- - `callbackUrl` is checked for http/https only. It is not protected against SSRF (for example `http://localhost` or private IP ranges).

## Roadmap

- [x] Phase 0: project setup, Docker, migrations
- [x] Phase 1: jobs API
- [x] Phase 2: workers with safe claiming
- [x] Phase 3: retries, backoff, jitter
- [x] Phase 4: recurring jobs
- [x] Phase 5: crash recovery (lease expiry, heartbeat)
- [x] Phase 6: graceful shutdown
- [ ] Phase 7: webhook delivery with HMAC signing
- [ ] Phase 8: dashboard
- [ ] Phase 9: automated tests, load test, CI, deployment