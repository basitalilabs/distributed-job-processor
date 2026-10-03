const sendEmail = require("./sendEmail");
const flaky = require("./flaky");
const handlers = {
  send_email: sendEmail,
  flaky: flaky
};

function getHandler(type) {
  if (Object.hasOwn(handlers, type)) {
    return handlers[type];
  }
  return null;              // no handler for this type
}

module.exports = getHandler;