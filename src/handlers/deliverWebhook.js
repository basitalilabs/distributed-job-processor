const PermanentError = require("../errors/PermanentError");

const WEBHOOK_TIMEOUT_MS = 10000; // decision 010

async function deliverWebhook(payload, job) {
  // A webhook job without a URL can never succeed, do not retry it
  if (typeof payload.url !== "string") {
    throw new PermanentError("deliver_webhook payload has no url");
  }

  const body = {
    jobId: payload.jobId,
    type: payload.type,
    status: payload.status
  };

  const response = await fetch(payload.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS)
  });

  if (!response.ok) {
    throw new Error("Webhook receiver answered with status " + response.status);
  }

  console.log("[webhook] job " + payload.jobId + " delivered to " + payload.url);
}

module.exports = deliverWebhook;