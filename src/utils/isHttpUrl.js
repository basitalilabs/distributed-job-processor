function isHttpUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch (error) {
    return false;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:";
}

module.exports = isHttpUrl;