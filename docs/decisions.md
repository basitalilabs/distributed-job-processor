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