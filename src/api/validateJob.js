const MAX_TYPE_LENGTH = 100;
const MIN_ATTEMPTS = 1;
const MAX_ATTEMPTS = 10;

const isPlainObject = require("../utils/isPlainObject");

function isHttpUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch (error) {
    return false;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:";
}

function validateCreateJob(body) {
  const errors = [];

  if (!isPlainObject(body)) {
    errors.push("Request body must be a JSON object");
    return errors;
  }

  if (typeof body.type !== "string" || body.type.trim().length === 0) {
    errors.push("type is required and must be a non-empty string");
  } else if (body.type.length > MAX_TYPE_LENGTH) {
    errors.push("type must be at most " + MAX_TYPE_LENGTH + " characters");
  }

  if (body.payload !== undefined && !isPlainObject(body.payload)) {
    errors.push("payload must be a JSON object");
  }

  if (body.runAt !== undefined) {
    const date = new Date(body.runAt);
    if (typeof body.runAt !== "string" || isNaN(date.getTime())) {
      errors.push("runAt must be a valid ISO date string, e.g. 2026-10-01T10:00:00Z");
    }
  }

  if (body.maxAttempts !== undefined) {
    if (
      !Number.isInteger(body.maxAttempts) ||
      body.maxAttempts < MIN_ATTEMPTS ||
      body.maxAttempts > MAX_ATTEMPTS
    ) {
      errors.push("maxAttempts must be a whole number from " + MIN_ATTEMPTS + " to " + MAX_ATTEMPTS);
    }
  }

    if (body.callbackUrl !== undefined) {
        if (typeof body.callbackUrl !== "string" || body.callbackUrl.length > 2000) {
            errors.push("callbackUrl must be a string of at most 2000 characters");
        } else if (!isHttpUrl(body.callbackUrl)) {
            errors.push("callbackUrl must be a valid http or https URL");
        }
    }

  return errors;
}

module.exports = validateCreateJob;