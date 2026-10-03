# Test Results

## Concurrency test (Phase 2)

**Setup:** 30 `send_email` jobs (simulated, 0.5 to 1.5 s each), workers running as separate processes against one PostgreSQL database.

| Workers | Total time | Speed-up |
|---|---|---|
| 1 | 31.7 s | baseline |
| 3 | 11.05 s | 2.87x |

**Correctness check**

    SELECT status, attempts, count(*) FROM jobs WHERE id > 9 GROUP BY status, attempts;

    done | 1 | 30

All 30 jobs finished, each claimed exactly once. No duplicates, no lost jobs.

**Limits of this test:** handlers are simulated waits, so this shows correct sharing and scaling for I/O-style jobs, not maximum throughput.

## Retry test (Phase 3)

| Case | Result |
|---|---|
| Valid job | done on attempt 1 |
| Handler throws PermanentError | failed immediately, no retry |
| Fails twice, then succeeds | retried after 5.4 s and 10.2 s, done on attempt 3 |
| Always fails, maxAttempts 3 | retried after 5.2 s and 10.5 s, failed on attempt 3 |

Delays follow exponential backoff (5 s, 10 s) plus up to 20% jitter.