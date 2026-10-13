const test = require("node:test");
const assert = require("node:assert/strict");
const validateCreateJob = require("../../src/api/validateJob.js");

// A body that passes every rule. Each test starts from a fresh copy.
function validBody() {
  return { type: "send_email", payload: { to: "a@b.com" } };
}

// Valid bodies: errors must be an empty array
const VALID_CASES = [
  { name: "minimal body", changes: {} },
  { name: "maxAttempts at the lowest allowed value", changes: { maxAttempts: 1 } },
  { name: "maxAttempts at the highest allowed value", changes: { maxAttempts: 10 } },
  { name: "valid runAt", changes: { runAt: "2026-10-01T10:00:00Z" } },
  { name: "valid callbackUrl", changes: { callbackUrl: "https://example.com/hook" } }
];

for (let i = 0; i < VALID_CASES.length; i++) {
  const testCase = VALID_CASES[i];
  test("accepts: " + testCase.name, function () {
    const body = Object.assign(validBody(), testCase.changes);
    assert.deepEqual(validateCreateJob(body), []);
  });
}

// Invalid bodies: exactly one error, with this exact message
const TYPE_REQUIRED = "type is required and must be a non-empty string";
const MAX_ATTEMPTS_ERROR = "maxAttempts must be a whole number from 1 to 10";
const RUN_AT_ERROR = "runAt must be an ISO date with a timezone, e.g. 2026-10-01T10:00:00Z";

const INVALID_CASES = [
  { name: "type missing", changes: { type: undefined }, error: TYPE_REQUIRED },
  { name: "type only spaces", changes: { type: "   " }, error: TYPE_REQUIRED },
  { name: "type too long", changes: { type: "a".repeat(101) }, error: "type must be at most 100 characters" },
  { name: "payload is an array", changes: { payload: [1, 2] }, error: "payload must be a JSON object" },
  { name: "maxAttempts below range", changes: { maxAttempts: 0 }, error: MAX_ATTEMPTS_ERROR },
  { name: "maxAttempts above range", changes: { maxAttempts: 11 }, error: MAX_ATTEMPTS_ERROR },
  { name: "maxAttempts not whole", changes: { maxAttempts: 2.5 }, error: MAX_ATTEMPTS_ERROR },
  { name: "maxAttempts as a string", changes: { maxAttempts: "3" }, error: MAX_ATTEMPTS_ERROR },
  { name: "runAt is a number", changes: { runAt: 12345 }, error: RUN_AT_ERROR },
  { name: "runAt is random text", changes: { runAt: "hello 5" }, error: RUN_AT_ERROR },
  { name: "callbackUrl too long", changes: { callbackUrl: "https://x.com/" + "a".repeat(2000) }, error: "callbackUrl must be a string of at most 2000 characters" },
  { name: "callbackUrl wrong protocol", changes: { callbackUrl: "ftp://x.com" }, error: "callbackUrl must be a valid http or https URL" },
  { name: "runAt Feb 30", changes: { runAt: "2026-02-30T10:00:00Z" }, error: RUN_AT_ERROR },
  { name: "runAt without timezone", changes: { runAt: "2026-10-01T10:00:00" }, error: RUN_AT_ERROR },
];

for (let i = 0; i < INVALID_CASES.length; i++) {
  const testCase = INVALID_CASES[i];
  test("rejects: " + testCase.name, function () {
    const body = Object.assign(validBody(), testCase.changes);
    assert.deepEqual(validateCreateJob(body), [testCase.error]);
  });
}

test("rejects a body that is not an object", function () {
  assert.deepEqual(validateCreateJob(null), ["Request body must be a JSON object"]);
});

test("reports every broken field, not just the first", function () {
  const body = Object.assign(validBody(), { type: "", maxAttempts: 0 });
  assert.equal(validateCreateJob(body).length, 2);
});