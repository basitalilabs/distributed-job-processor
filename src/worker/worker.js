const os = require("os");
const claimJob = require("./claimJob");
const finishJob = require("./finishJob");
const getHandler = require("../handlers");
const sleep = require("../utils/sleep");

const WORKER_ID = os.hostname() + "-" + process.pid;
const IDLE_SLEEP_MS = 1000;          // decision 004

async function processJob(job) {
  const handler = getHandler(job.type);

  // No handler: permanent error, fail right away (decision 003)
  if (handler === null) {
    await finishJob.markJobFailed(job.id, WORKER_ID, "No handler for job type: " + job.type);
    console.log("Job " + job.id + " failed: unknown type " + job.type);
    return;
  }

  // Run the handler
  try {
    await handler(job.payload, job);
  } catch (error) {
    const message = String(error.message || error).slice(0, 1000);
    await finishJob.markJobFailed(job.id, WORKER_ID, message);
    console.log("Job " + job.id + " failed: " + message);
    return;
  }

  await finishJob.markJobDone(job.id, WORKER_ID);
  console.log("Job " + job.id + " done");
}

async function runWorker() {
  console.log("Worker " + WORKER_ID + " started");

  while (true) {
    try {
      const job = await claimJob(WORKER_ID);

      if (job === null) {
        await sleep(IDLE_SLEEP_MS);
        continue;                          // check again, never stop
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