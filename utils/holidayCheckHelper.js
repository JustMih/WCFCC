const moment = require("moment");
const db = require("../models");

const TZ_OFFSET = "+03:00";

function todayDateString() {
  return moment().utcOffset(TZ_OFFSET).format("YYYY-MM-DD");
}

/**
 * True when today (EAT +03:00) is a configured public holiday in `holidays` table.
 */
async function isTodayPublicHoliday() {
  const today = todayDateString();
  try {
    const Holiday = db.holidays;
    if (!Holiday) return false;
    const count = await Holiday.count({
      where: { holiday_date: today },
    });
    return count > 0;
  } catch (err) {
    console.error("isTodayPublicHoliday:", err?.message || err);
    return false;
  }
}

module.exports = {
  todayDateString,
  isTodayPublicHoliday,
};
