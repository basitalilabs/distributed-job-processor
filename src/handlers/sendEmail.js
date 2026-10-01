const sleep = require("../utils/sleep");

async function sendEmail(payload, job) {
  // Permanent mistake in the data: fail loudly
  if (typeof payload.to !== "string") {
    throw new Error("payload.to is required for send_email");
  }

  console.log("[send_email] job " + job.id + ": sending to " + payload.to);

  // Pretend the email takes 0.5 to 1.5 seconds to send
  const delay = 500 + Math.floor(Math.random() * 1000);
  await sleep(delay);

  console.log("[send_email] job " + job.id + ": sent");
}

module.exports = sendEmail;