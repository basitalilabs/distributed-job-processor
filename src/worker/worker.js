const os = require("os");
const claimJob = require("./claimJob");
const finishJob = require("./finishJob");
const getHandler = require("../handlers");
const sleep = require("../utils/sleep");
const PermanentError = require("../errors/PermanentError");
const retryDelay = require("./retryDelay");
const reapExpiredJobs = require("./reaper");
const heartbeat = require("./heartbeat");
const pool = require("../db/pool");

const WORKER_ID = os.hostname() + "-" + process.pid;
const IDLE_SLEEP_MS = 1000; // decision 004
const REAP_INTERVAL_MS = 5000;

const SHUTDOWN_TIMEOUT_MS = 20000; // decision 009
const WATCH_INTERVAL_MS = 200;
let shuttingDown = false;
let shutdownStartedAt = null;

function handleStopSignal(signalName) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  shutdownStartedAt = Date.now();
  console.log("Worker " + WORKER_ID + " received " + signalName + ", will stop after current job");
}

process.on("SIGTERM", function onSigterm() {
  handleStopSignal("SIGTERM");
});

process.on("SIGINT", function onSigint() {
  handleStopSignal("SIGINT");
});

async function processJob(job) {
    const handler = getHandler(job.type);

    // No handler: permanent error, fail right away (decision 003)
    if (handler === null) {
        await finishJob.markJobFailed(
            job,
            WORKER_ID,
            "No handler for job type: " + job.type,
        );
        console.log("Job " + job.id + " failed: unknown type " + job.type);
        return;
    }

    // Run the handler, with a heartbeat keeping the lease alive
    const heartbeatTimer = heartbeat.startHeartbeat(job.id, WORKER_ID);
    let finished = false;
    let handlerError = null;

    // Start the job but do not await it. When it ends, set the flags.
    handler(job.payload, job).then(
        function onHandlerSuccess() {
            finished = true;
        },
        function onHandlerFailure(error) {
            handlerError = error;
            finished = true;
        }
    );

    // Watch the job and the clock at the same time
    while (!finished) {
        const deadlinePassed =
            shuttingDown && Date.now() - shutdownStartedAt >= SHUTDOWN_TIMEOUT_MS;

        if (deadlinePassed) {
            heartbeat.stopHeartbeat(heartbeatTimer);
            const released = await finishJob.releaseJob(job.id, WORKER_ID);
            console.log(
                released
                    ? "Job " + job.id + " released back to the queue (shutdown timeout)"
                    : "Job " + job.id + " could not be released, the lease was lost"
            );
            return;
        }

        await sleep(WATCH_INTERVAL_MS);
    }

    heartbeat.stopHeartbeat(heartbeatTimer);

    // Handler failed: retry or give up
    if (handlerError !== null) {
        const message = String(handlerError.message || handlerError).slice(0, 1000);
        const isPermanent = handlerError instanceof PermanentError;
        const hasAttemptsLeft = job.attempts < job.max_attempts;

        if (!isPermanent && hasAttemptsLeft) {
            const delaySeconds = retryDelay.getRetryDelaySeconds(job.attempts);
            const recorded = await finishJob.retryJob(job.id, WORKER_ID, message, delaySeconds);
            console.log(
                recorded
                    ? "Job " + job.id + " failed (attempt " + job.attempts + " of " + job.max_attempts + "), retry in " + delaySeconds.toFixed(1) + " s: " + message
                    : "Job " + job.id + " failed, but the lease was lost. Not recorded"
            );
            return;
        }

        const recorded = await finishJob.markJobFailed(job, WORKER_ID, message);
        console.log(
            recorded
                ? "Job " + job.id + " failed permanently: " + message
                : "Job " + job.id + " failed, but the lease was lost. Not recorded"
        );
        return;
    }

    // Handler succeeded
    const recorded = await finishJob.markJobDone(job, WORKER_ID);
    if (recorded) {
        console.log("Job " + job.id + " done");
    } else {
        console.log("Job " + job.id + " finished, but the lease was lost. Result not recorded");
    }
}

async function runWorker() {
    console.log("Worker " + WORKER_ID + " started");

    let lastReapAt = 0;
    while (!shuttingDown) {
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
                continue; // check again
            }

            await processJob(job);
        } catch (error) {
            // Database problem etc. Log it, wait, keep going
            console.error("Worker error:", error.message || error.code);
            await sleep(IDLE_SLEEP_MS);
        }
    }
    console.log("Worker " + WORKER_ID + " stopped");
    await pool.end();
    process.exit(0);
}

runWorker();
