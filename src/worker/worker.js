const os = require("os");
const claimJob = require("./claimJob");
const finishJob = require("./finishJob");
const getHandler = require("../handlers");
const sleep = require("../utils/sleep");
const PermanentError = require("../errors/PermanentError");
const retryDelay = require("./retryDelay");
const reapExpiredJobs = require("./reaper");

const WORKER_ID = os.hostname() + "-" + process.pid;
const IDLE_SLEEP_MS = 1000; // decision 004
const REAP_INTERVAL_MS = 5000;

async function processJob(job) {
    const handler = getHandler(job.type);

    // No handler: permanent error, fail right away (decision 003)
    if (handler === null) {
        await finishJob.markJobFailed(
            job.id,
            WORKER_ID,
            "No handler for job type: " + job.type,
        );
        console.log("Job " + job.id + " failed: unknown type " + job.type);
        return;
    }

    // Run the handler
    try {
        await handler(job.payload, job);
    } catch (error) {
        const message = String(error.message || error).slice(0, 1000);

        const isPermanent = error instanceof PermanentError;
        const hasAttemptsLeft = job.attempts < job.max_attempts;

        if (!isPermanent && hasAttemptsLeft) {
            const delaySeconds = retryDelay.getRetryDelaySeconds(job.attempts);
            await finishJob.retryJob(job.id, WORKER_ID, message, delaySeconds);
            console.log(
                "Job " +
                job.id +
                " failed (attempt " +
                job.attempts +
                " of " +
                job.max_attempts +
                "), retry in " +
                delaySeconds.toFixed(1) +
                " s: " +
                message,
            );
            return;
        }

        await finishJob.markJobFailed(job.id, WORKER_ID, message);
        console.log("Job " + job.id + " failed permanently: " + message);
        return;
    }
    // Only reached when the handler did not throw
    await finishJob.markJobDone(job.id, WORKER_ID);
    console.log("Job " + job.id + " done");
}

async function runWorker() {
    console.log("Worker " + WORKER_ID + " started");

    let lastReapAt = 0;
    while (true) {
        try {

            if (Date.now() - lastReapAt >= REAP_INTERVAL_MS) {
                lastReapAt = Date.now();
                const reaped = await reapExpiredJobs();

                if (reaped.requeued > 0 || reaped.failed > 0) {
                    console.log("Reaper: " + reaped.requeued + " job(s) requeued, " + reaped.failed + " failed");
                }
            }
            const job = await claimJob(WORKER_ID);

            if (job === null) {
                await sleep(IDLE_SLEEP_MS);
                continue; // check again, never stop
            }

            await processJob(job);
        } catch (error) {
            // Database problem etc. Log it, wait, keep going
            console.error("Worker error:", error.message || error.code);
            await sleep(IDLE_SLEEP_MS);
        }
    }
}

runWorker();
