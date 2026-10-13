// YYYY-MM-DDTHH:MM, optional :SS and .mmm, then Z or +05:00 (decision 013)
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

function isIsoDate(value) {
  if (typeof value !== "string") {
    return false;
  }

  const match = ISO_DATE_PATTERN.exec(value);
  if (match === null) {
    return false;
  }

  // Catches month 13, hour 25, and similar
  if (isNaN(new Date(value).getTime())) {
    return false;
  }

  // Catches Feb 30: JavaScript would roll it over to March 2
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

module.exports = isIsoDate;