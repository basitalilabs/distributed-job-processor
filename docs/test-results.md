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

## Scheduler test (Phase 4)

**Setup:** one schedule with cron `* * * * *`, created about 28 hours before the scheduler was first started.

| Check | Result |
|---|---|
| Start after 28 hours overdue | 1 job created, not one per missed minute |
| Jobs per minute over 6 minutes | exactly 1 each (verified with SQL, grouped by minute) |
| Second scheduler started, first stopped | second took over the next minute, no gap, no duplicate |

## Crash recovery test (Phase 5, reaper)

**Setup:** `slow` jobs (a fixed wait), lease of 30 s, reaper run by each worker every 5 s. No heartbeat yet.

| Case | Result |
|---|---|
| Worker killed mid-job | job requeued after the lease expired, completed by another worker on attempt 2 |
| Worker killed mid-job, maxAttempts 1 | job marked failed 32 s after it was claimed |
| Job longer than the lease (45 s vs 30 s), 2 workers, nobody killed | job ran 5 times, no completion was recorded, marked failed after 165 s. Every worker logged "done" |

**Finding from the third case:** without a heartbeat, a job longer than the lease can never succeed. Each run loses its lease before finishing, the job is taken by another worker, and the cycle repeats until attempts run out. The workers' "done" log lines were false, because their final update matched zero rows. Both problems are addressed in the next step (heartbeat, and checking whether the update changed a row).