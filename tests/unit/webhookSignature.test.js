const test = require("node:test");
const assert = require("node:assert/strict");
const webhookSignature = require("../../src/utils/webhookSignature");

const SECRET = "test-secret";
const TIMESTAMP = "1700000000";
const BODY = JSON.stringify({ jobId: 1, type: "send_email", status: "done" });

test("signature starts with sha256= and has 64 hex characters", function () {
  const signature = webhookSignature.createSignature(SECRET, TIMESTAMP, BODY);
  assert.match(signature, /^sha256=[0-9a-f]{64}$/);
});

test("same inputs give the same signature", function () {
  const first = webhookSignature.createSignature(SECRET, TIMESTAMP, BODY);
  const second = webhookSignature.createSignature(SECRET, TIMESTAMP, BODY);
  assert.equal(first, second);
});

test("changing the body changes the signature", function () {
  const original = webhookSignature.createSignature(SECRET, TIMESTAMP, BODY);
  const changedBody = BODY.replace("done", "failed");
  const changed = webhookSignature.createSignature(SECRET, TIMESTAMP, changedBody);
  assert.notEqual(original, changed);
});

test("a different secret gives a different signature", function () {
  const original = webhookSignature.createSignature(SECRET, TIMESTAMP, BODY);
  const other = webhookSignature.createSignature("different-secret", TIMESTAMP, BODY);
  assert.notEqual(original, other);
});

test("matches a known value (locks the timestamp.body format)", function () {
  const signature = webhookSignature.createSignature(SECRET, TIMESTAMP, BODY);
  assert.equal(signature, "sha256=59a756d0e51368ecf7d15daa93039f67de451bc77e5f1d2fdf3c7511b0498699");
});