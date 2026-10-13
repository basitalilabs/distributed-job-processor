const test = require("node:test");
const assert = require("node:assert/strict");
const isHttpUrl = require("../../src/utils/isHttpUrl");

const CASES = [
  { input: "http://example.com/hook", expected: true },
  { input: "https://example.com/hook", expected: true },
  { input: "ftp://example.com", expected: false },
  { input: "javascript:alert(1)", expected: false },
  { input: "example.com/hook", expected: false },
  { input: "not a url", expected: false },
  { input: "", expected: false },
  { input: "HTTPS://EXAMPLE.COM", expected: true }
];

for (let i = 0; i < CASES.length; i++) {
  const testCase = CASES[i];
  test("isHttpUrl(" + JSON.stringify(testCase.input) + ") is " + testCase.expected, function () {
    assert.equal(isHttpUrl(testCase.input), testCase.expected);
  });
}