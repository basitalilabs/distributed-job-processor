function sleep(milliseconds) {
  return new Promise(function waitThenResolve(resolve) {
    setTimeout(resolve, milliseconds);
  });
}

module.exports = sleep;