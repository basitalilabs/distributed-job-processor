const cronParser = require("cron-parser");
const CronExpressionParser = cronParser.CronExpressionParser;

// Next run time after fromDate, as a Date. Throws if the expression is invalid.
function getNextRunTime(cronExpression, fromDate) {
  const interval = CronExpressionParser.parse(cronExpression, {
    currentDate: fromDate,       // start counting from this moment
    tz: "UTC"               // decision 006
  });

  return interval.next().toDate();
}

// true only for a valid 5-field cron expression
function isValidCron(cronExpression) {
  if (typeof cronExpression !== "string") {
    return false;
  }

  const fields = cronExpression.trim().split(/\s+/);
  if (fields.length !== 5) {
    return false;
  }

  try {
    getNextRunTime(cronExpression, new Date());
    return true;
  } catch (error) {
    return false;
  }
}

module.exports = {
  getNextRunTime: getNextRunTime,
  isValidCron: isValidCron
};