// Test handler: fails until the job reaches payload.succeedOnAttempt
async function flaky(payload, job) {
  const succeedOnAttempt = payload.succeedOnAttempt || 3;

  if (job.attempts < succeedOnAttempt) {
    throw new Error("Simulated temporary failure on attempt " + job.attempts);
  }

  console.log("[flaky] job " + job.id + ": succeeded on attempt " + job.attempts);
}

module.exports = flaky;