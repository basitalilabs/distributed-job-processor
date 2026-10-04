const isPlainObject = require("../utils/isPlainObject");
const { isValidCron } = require("../scheduler/cron");

function validateCreateSchedule(body) {
  const errors = [];

  if (!isPlainObject(body)) {
    errors.push("Request body must be a JSON object");
    return errors;
  }

  if (typeof body.name !== "string" || body.name.trim().length === 0) {
    errors.push("name is required and must be a non-empty string");
  }else if (body.name.length > 100) {
    errors.push("name must be at most 100 characters");
  } 

  if (typeof body.cron !== "string" || !isValidCron(body.cron)) {
    errors.push("cron is required and must be a valid 5-field cron expression");
  }

  if (typeof body.jobType !== "string" || body.jobType.trim().length === 0) {
    errors.push("jobType is required and must be a non-empty string");
  }

  if (body.payload !== undefined && !isPlainObject(body.payload)) {
    errors.push("payload must be a JSON object");
  }

  if (body.enabled !== undefined && typeof body.enabled !== "boolean") {
    errors.push("enabled must be a boolean");
  }

  return errors;
}

module.exports = validateCreateSchedule;