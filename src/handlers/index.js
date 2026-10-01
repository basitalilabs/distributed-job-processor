const sendEmail = require("./sendEmail");

const handlers = {
  send_email: sendEmail
};

function getHandler(type) {
  if (Object.hasOwn(handlers, type)) {
    return handlers[type];
  }
  return null;              // no handler for this type
}

module.exports = getHandler;