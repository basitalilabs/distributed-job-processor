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

## Heartbeat (Phase 5c)

Setup: 2 workers, lease 30 s, heartbeat every 10 s, reaper every 5 s.

| Test | Job | Result |
|---|---|---|
| Job longer than the lease (70 s) | 118 | Ran once. `done`, `attempts: 1`. Lease time left was read 4 times during the run: 28.6, 20.2, 21.6, 21.0 s. It never went below 20 s. |
| Worker killed about 15 s into a 40 s job | 119 | Other worker recovered it. `done`, `attempts: 2`, `last_error: Worker stopped responding (lease expired)`. 84 s from create to done. |

Before the heartbeat, a 45 s job (job 117) lost its lease on every run,
was run 5 times by 2 workers, and ended `failed`. Job 118 is the same
situation after the fix.

Not measured: the exact moment the reaper requeued job 119.

## Poison job (Phase 5d)

Setup: 1 worker, restarted by hand after each kill. Job: `slow`, 60 s, `maxAttempts: 3`.
The worker was killed with Ctrl + C shortly after each pickup.

| Crash | Reaper log | Job after |
|---|---|---|
| 1 | 1 requeued, 0 failed | `waiting`, picked up again |
| 2 | 1 requeued, 0 failed | `waiting`, picked up again |
| 3 | 0 requeued, 1 failed | `failed`, not picked up again |

Final row (job 120): `failed`, `attempts: 3`,
`last_error: Worker stopped responding (lease expired), no attempts left`.
103 s from create to failed.

Not tested: a real crash such as out of memory. The crash was simulated by killing the process.