const crypto = require("crypto");

// Signature of "timestamp.body" with the shared secret (decision 011)
function createSignature(secret, timestamp, bodyText) {
  const signedText = timestamp + "." + bodyText;
  const hex = crypto.createHmac("sha256", secret).update(signedText).digest("hex");
  return "sha256=" + hex;
}

module.exports = { createSignature: createSignature };