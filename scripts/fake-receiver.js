// Pretends to be a shop that receives webhooks. Test tool only.
// MODE=ok   -> answers 200 if the request is valid
// MODE=fail -> answers 500 even if valid
// MAX_AGE_SECONDS -> how old a timestamp may be (default 300 = 5 minutes)
const express = require("express");
const crypto = require("crypto");
const webhookSignature = require("../src/utils/webhookSignature");

const PORT = 4000;
const MODE = process.env.MODE || "ok";
const SECRET = process.env.WEBHOOK_SECRET;
const MAX_AGE_SECONDS = Number(process.env.MAX_AGE_SECONDS || 300);

if (!SECRET) {
  throw new Error("WEBHOOK_SECRET is not set. Run with --env-file=.env");
}

// Compare in constant time, so an attacker cannot learn the signature
// one character at a time by measuring how fast we say "no"
function signaturesMatch(expected, received) {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received || "");
  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

const app = express();
// Keep the body as raw text: the signature was made from the exact text sent
app.use(express.text({ type: "application/json" }));

app.post("/hook", function receiveWebhook(req, res) {
  const bodyText = req.body;
  const timestamp = req.get("X-Webhook-Timestamp");
  const signature = req.get("X-Webhook-Signature");

  console.log(new Date().toISOString() + " received");
  console.log("  X-Webhook-Timestamp: " + timestamp);
  console.log("  X-Webhook-Signature: " + signature);
  console.log("  body: " + bodyText);

  // 1. Timestamp missing or too old: reject (stops replay)
  const age = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (!timestamp || isNaN(age) || Math.abs(age) > MAX_AGE_SECONDS) {
    console.log("  -> 401, timestamp missing or too old (" + age + " s)");
    return res.status(401).json({ error: "timestamp too old" });
  }

  // 2. Signature must match this exact timestamp and body
  const expected = webhookSignature.createSignature(SECRET, timestamp, bodyText);
  if (!signaturesMatch(expected, signature)) {
    console.log("  -> 401, bad signature");
    return res.status(401).json({ error: "bad signature" });
  }

  // 3. Valid
  const status = MODE === "fail" ? 500 : 200;
  console.log("  -> signature valid, answering " + status);
  return res.status(status).json({ mode: MODE });
});

app.listen(PORT, function onListen() {
  console.log("Fake receiver on port " + PORT + ", mode " + MODE + ", max age " + MAX_AGE_SECONDS + " s");
});