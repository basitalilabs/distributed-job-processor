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