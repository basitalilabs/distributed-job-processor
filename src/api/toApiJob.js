function toApiJob(row) {
  return {
    id: row.id,
    type: row.type,
    payload: row.payload,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    runAt: row.run_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    callbackUrl: row.callback_url
  };
}

module.exports = toApiJob;