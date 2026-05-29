const sequelize = require("../../config/database");
const { QueryTypes } = require("sequelize");
const {
  countTodayMissedCalls,
  countMissedCallsInRange,
  countQueueDroppedInRange,
  countIvrAnsweredExcludingQueueLost,
  ensureLostAbandonsInMissedCalls,
} = require("../../utils/missedCallHelper");

/**
 * Fetch total, answered (with agent), IVR (answered without agent),
 * dropped, and lost counts from call_summary view for a date range.
 * Uses `status` column (not cdr_status).
 */
async function getCountsForRange(startDate, endDate) {
  const dateFilter = "WHERE call_start BETWEEN :startDate AND :endDate";
  const params = { startDate, endDate };

  const [totalRes, answeredRes, ivrRes, droppedRes, lostRes] = await Promise.all([
    sequelize.query(
      `SELECT COUNT(*) AS total FROM call_summary ${dateFilter}`,
      { replacements: params, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT COUNT(*) AS total FROM call_summary ${dateFilter} AND status = 'ANSWERED' AND agent IS NOT NULL`,
      { replacements: params, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT COUNT(*) AS total FROM call_summary ${dateFilter} AND status = 'ANSWERED' AND agent IS NULL`,
      { replacements: params, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT COUNT(*) AS total FROM call_summary ${dateFilter} AND status = 'DROPPED'`,
      { replacements: params, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT COUNT(*) AS total FROM call_summary ${dateFilter} AND status = 'LOST'`,
      { replacements: params, type: QueryTypes.SELECT }
    ),
  ]);

  const toInt = (row) => parseInt(row[0]?.total || 0, 10);
  return {
    totalCalls: toInt(totalRes),
    answered: toInt(answeredRes),
    ivr: toInt(ivrRes),
    dropped: toInt(droppedRes),
    lost: toInt(lostRes),
  };
}

/**
 * Fetch answered, IVR, dropped, and lost counts from call_summary
 * for a given date range and direction (e.g. 'INBOUND' or 'OUTBOUND').
 * Assumes call_summary has a `direction` column.
 */
async function getCountsForRangeByDirection(startDate, endDate, direction) {
  const dateFilter = "WHERE call_start BETWEEN :startDate AND :endDate";
  const params = { startDate, endDate, direction };

  const [totalRes, answeredRes, ivrRes, droppedRes, lostRes] = await Promise.all([
    sequelize.query(
      `SELECT COUNT(*) AS total FROM call_summary ${dateFilter} AND direction = :direction`,
      { replacements: params, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT COUNT(*) AS total FROM call_summary ${dateFilter} AND status = 'ANSWERED' AND agent IS NOT NULL AND direction = :direction`,
      { replacements: params, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT COUNT(*) AS total FROM call_summary ${dateFilter} AND status = 'ANSWERED' AND agent IS NULL AND direction = :direction`,
      { replacements: params, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT COUNT(*) AS total FROM call_summary ${dateFilter} AND status = 'DROPPED' AND direction = :direction`,
      { replacements: params, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT COUNT(*) AS total FROM call_summary ${dateFilter} AND status = 'LOST' AND direction = :direction`,
      { replacements: params, type: QueryTypes.SELECT }
    ),
  ]);

  const toInt = (row) => parseInt(row[0]?.total || 0, 10);
  return {
    totalCalls: toInt(totalRes),
    answered: toInt(answeredRes),
    ivr: toInt(ivrRes),
    dropped: toInt(droppedRes),
    lost: toInt(lostRes),
  };
}

/**
 * Get call statistics summary from call_summary view.
 * Returns total calls, answered (with agent), IVR (answered without agent),
 * dropped, and lost for current day, month, and year.
 * Uses `status` (not cdr_status).
 * @route GET /api/call-summary/call-summary
 */
const getCallSummary = async (req, res) => {
  try {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");

    // Current day: 00:00:00 -> 23:59:59
    const dayStart = `${y}-${m}-${d} 00:00:00`;
    const dayEnd = `${y}-${m}-${d} 23:59:59`;

    // Current month: first day 00:00:00 -> last day 23:59:59
    const monthStart = `${y}-${m}-01 00:00:00`;
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
    const monthEnd = `${y}-${m}-${String(lastDay).padStart(2, "0")} 23:59:59`;

    // Current year
    const yearStart = `${y}-01-01 00:00:00`;
    const yearEnd = `${y}-12-31 23:59:59`;

    const [currentDay, currentMonth, currentYear] = await Promise.all([
      getCountsForRange(dayStart, dayEnd),
      getCountsForRange(monthStart, monthEnd),
      getCountsForRange(yearStart, yearEnd),
    ]);

    await ensureLostAbandonsInMissedCalls(sequelize);

    const [
      lostToday,
      droppedToday,
      ivrToday,
      ivrMonth,
      ivrYear,
      lostMonth,
      droppedMonth,
      lostYear,
      droppedYear,
    ] = await Promise.all([
      countTodayMissedCalls(sequelize),
      countQueueDroppedInRange(sequelize, dayStart, dayEnd),
      countIvrAnsweredExcludingQueueLost(sequelize, dayStart, dayEnd),
      countIvrAnsweredExcludingQueueLost(sequelize, monthStart, monthEnd),
      countIvrAnsweredExcludingQueueLost(sequelize, yearStart, yearEnd),
      countMissedCallsInRange(sequelize, monthStart, monthEnd),
      countQueueDroppedInRange(sequelize, monthStart, monthEnd),
      countMissedCallsInRange(sequelize, yearStart, yearEnd),
      countQueueDroppedInRange(sequelize, yearStart, yearEnd),
    ]);

    /** Total must equal answered + ivr + lost + dropped (same sources as breakdown). */
    const dayAnswered = currentDay.answered;
    const dayIvr = ivrToday;
    const monthAnswered = currentMonth.answered;
    const monthIvr = ivrMonth;
    const yearAnswered = currentYear.answered;
    const yearIvr = ivrYear;

    const response = {
      currentDay: {
        answered: dayAnswered,
        ivr: dayIvr,
        dropped: droppedToday,
        lost: lostToday,
        totalCalls: dayAnswered + dayIvr + lostToday + droppedToday,
      },
      currentMonth: {
        answered: monthAnswered,
        ivr: monthIvr,
        dropped: droppedMonth,
        lost: lostMonth,
        totalCalls: monthAnswered + monthIvr + lostMonth + droppedMonth,
      },
      currentYear: {
        answered: yearAnswered,
        ivr: yearIvr,
        dropped: droppedYear,
        lost: lostYear,
        totalCalls: yearAnswered + yearIvr + lostYear + droppedYear,
      },
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  } catch (err) {
    console.error("Error retrieving call summary data:", err.message);
    res.status(500).json({
      error: "Internal Server Error",
      message: err.message,
    });
  }
};

/**
 * Get inbound vs outbound call statistics summary from call_summary view
 * for the current day only.
 * Each section returns total, answered (with agent), IVR (answered without agent),
 * dropped, and lost.
 * @route GET /api/call-summary/call-summary-by-direction
 */
const getInboundOutboundSummary = async (req, res) => {
  try {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");

    const dayStart = `${y}-${m}-${d} 00:00:00`;
    const dayEnd = `${y}-${m}-${d} 23:59:59`;

    const [inbound, outbound] = await Promise.all([
      getCountsForRangeByDirection(dayStart, dayEnd, "INBOUND"),
      getCountsForRangeByDirection(dayStart, dayEnd, "OUTBOUND"),
    ]);

    res.json({
      inbound,
      outbound,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Error retrieving inbound/outbound call summary data:", err.message);
    res.status(500).json({
      error: "Internal Server Error",
      message: err.message,
    });
  }
};

module.exports = {
  getCallSummary,
  getInboundOutboundSummary,
};

