const PermanentError = require("../errors/PermanentError");
const webhookSignature = require("../utils/webhookSignature");

const WEBHOOK_TIMEOUT_MS = 10000; // decision 010

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
if (!WEBHOOK_SECRET) {
  throw new Error("WEBHOOK_SECRET is not set. Add it to .env (decision 011).");
}

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

  const bodyText = JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = webhookSignature.createSignature(WEBHOOK_SECRET, timestamp, bodyText);

  const response = await fetch(payload.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Timestamp": timestamp,
      "X-Webhook-Signature": signature
    },
    body: bodyText,
    signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS)
  });

  if (!response.ok) {
    throw new Error("Webhook receiver answered with status " + response.status);
  }

  console.log("[webhook] job " + payload.jobId + " delivered to " + payload.url);
}

module.exports = deliverWebhook;