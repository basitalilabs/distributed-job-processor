const sleep = require("../utils/sleep");

// Test handler: takes payload.seconds to finish (default 20)
async function slow(payload, job) {
  const seconds = payload.seconds || 20;
  console.log("[slow] job " + job.id + ": started, will take " + seconds + " s");
  await sleep(seconds * 1000);
  console.log("[slow] job " + job.id + ": finished");
}

module.exports = slow;