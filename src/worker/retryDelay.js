const BASE_DELAY_SECONDS = 5;      // decision 005
const MAX_DELAY_SECONDS = 300;       // decision 005
const JITTER_FRACTION = 0.2;         // 20% written as a decimal

// Delay without randomness: 5, 10, 20, 40... capped at the maximum
function getBackoffSeconds(attempts) {
  const exponential = BASE_DELAY_SECONDS * Math.pow(2, attempts - 1);
  return Math.min(exponential, MAX_DELAY_SECONDS);
}

// Backoff plus a random extra of 0 to 20%
function getRetryDelaySeconds(attempts) {
  const backoff = getBackoffSeconds(attempts);
  const jitter = backoff * JITTER_FRACTION * Math.random();
  return backoff + jitter;
}

module.exports = {
  getBackoffSeconds: getBackoffSeconds,
  getRetryDelaySeconds: getRetryDelaySeconds
};