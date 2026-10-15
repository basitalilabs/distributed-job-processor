const test = require("node:test");
const assert = require("node:assert/strict");
const backoff = require("../../src/worker/retryDelay");   // the path to this file, without .js

// ---------- The predictable part ----------

const CASES = [
  { attempts: 1, expected: 5 },
  { attempts: 2, expected: 10 },
  { attempts: 3, expected: 20 },
  { attempts: 4, expected: 40 },
  { attempts: 6, expected: 160 },
  { attempts: 7, expected: 300 },    // 5 * 2^6 = 320, capped
  { attempts: 20, expected: 300 }   // a huge number, still capped
];

for (let i = 0; i < CASES.length; i++) {
  const testCase = CASES[i];
  test("backoff for attempt " + testCase.attempts + " is " + testCase.expected + " s", function () {
    assert.equal(backoff.getBackoffSeconds(testCase.attempts), testCase.expected);
  });
}

// ---------- The random part ----------

test("jitter 0 gives exactly the base delay", function (t) {
  t.mock.method(Math, "random", function () { return 0; });
  assert.equal(backoff.getRetryDelaySeconds(3), 20);
});

test("jitter at its maximum adds 20%", function (t) {
  t.mock.method(Math, "random", function () { return 1; });
  assert.equal(backoff.getRetryDelaySeconds(3), 24);
});

test("1000 real random delays all stay between base and base + 20%", function () {
  for (let i = 0; i < 1000; i++) {
    const delay = backoff.getRetryDelaySeconds(3);
    assert.ok(delay >= 20 && delay <= 24, "delay was " + delay);
  }
});