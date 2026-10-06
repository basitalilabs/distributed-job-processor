const LEASE_SECONDS = 30;
const HEARTBEAT_INTERVAL_MS = 10000;   // one third of the lease (decision 007)

module.exports = {
  LEASE_SECONDS: LEASE_SECONDS,
  HEARTBEAT_INTERVAL_MS: HEARTBEAT_INTERVAL_MS
};