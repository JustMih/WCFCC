const sequelize = require("../../config/database");
const { QueryTypes } = require("sequelize");
const { buildCdrDestinationWhere } = require("../../utils/callSummaryReportHelper");

function buildRangeWhereClause(excludeDestS) {
  let sql = "WHERE call_start BETWEEN :startDate AND :endDate";
  if (excludeDestS) {
    sql += ` AND ${buildCdrDestinationWhere("").sql}`;
  }
  return sql;
}

/**
 * Fetch total, answered (with agent), IVR (answered without agent),
 * dropped, and lost counts from call_summary view for a date range.
 * Uses `status` column (not cdr_status).
 */
async function getCountsForRange(startDate, endDate, options = {}) {
  const excludeDestS =
    options.excludeDestS === true ||
    options.excludeDestS === "1" ||
    options.excludeDestS === "true";
  const dateFilter = buildRangeWhereClause(excludeDestS);
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
 * Build WHERE fragment matching calls assigned to an agent extension.
 * Matches agent/called/caller against extension and optional SIP aliases (username).
 */
function buildAgentScopeWhere(direction, agentExtension, options = {}) {
  const ext = String(agentExtension).trim();
  const aliases = [
    ext,
    ext.padStart(4, "0"),
    ...(options.agentAliases || [])
      .map((value) => String(value).trim())
      .filter(Boolean),
  ].filter(Boolean);
  const agentAliases = [...new Set(aliases)];

  const matchParts = ["TRIM(CAST(agent AS CHAR)) IN (:agentAliases)"];

  const extNum = parseInt(ext, 10);
  if (!Number.isNaN(extNum)) {
    matchParts.push("CAST(agent AS UNSIGNED) = :agentExtNum");
  }

  if (direction === "INBOUND") {
    matchParts.push("TRIM(CAST(called AS CHAR)) IN (:agentAliases)");
    if (!Number.isNaN(extNum)) {
      matchParts.push("CAST(called AS UNSIGNED) = :agentExtNum");
    }
  }

  if (direction === "OUTBOUND") {
    matchParts.push("TRIM(CAST(caller AS CHAR)) IN (:agentAliases)");
    if (!Number.isNaN(extNum)) {
      matchParts.push("CAST(caller AS UNSIGNED) = :agentExtNum");
    }
  }

  const replacements = { agentAliases };
  if (!Number.isNaN(extNum)) {
    replacements.agentExtNum = extNum;
  }

  return { sql: `(${matchParts.join(" OR ")})`, replacements };
}

/**
 * Fetch answered, dropped, and lost counts from call_summary for a specific
 * agent extension and direction.
 * total = answered + dropped + lost.
 */
async function getCountsForAgentByDirection(
  startDate,
  endDate,
  direction,
  agentExtension,
  options = {}
) {
  const excludeDestS =
    options.excludeDestS === true ||
    options.excludeDestS === "1" ||
    options.excludeDestS === "true";

  const agentScope = buildAgentScopeWhere(direction, agentExtension, options);

  let dateFilter =
    "WHERE call_start BETWEEN :startDate AND :endDate AND direction = :direction AND " +
    agentScope.sql;
  if (excludeDestS) {
    dateFilter += ` AND ${buildCdrDestinationWhere("").sql}`;
  }

  const params = {
    startDate,
    endDate,
    direction,
    ...agentScope.replacements,
  };

  const [answeredRes, droppedRes, lostRes] = await Promise.all([
    sequelize.query(
      `SELECT COUNT(*) AS total FROM call_summary ${dateFilter} AND LOWER(status) = 'answered'`,
      { replacements: params, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT COUNT(*) AS total FROM call_summary ${dateFilter} AND LOWER(status) = 'dropped'`,
      { replacements: params, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT COUNT(*) AS total FROM call_summary ${dateFilter} AND LOWER(status) = 'lost'`,
      { replacements: params, type: QueryTypes.SELECT }
    ),
  ]);

  const toInt = (row) => parseInt(row?.total || 0, 10);
  const answered = toInt(answeredRes[0]);
  const dropped = toInt(droppedRes[0]);
  const lost = toInt(lostRes[0]);

  return {
    answered,
    dropped,
    lost,
    total: answered + dropped + lost,
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

    const excludeDestS =
      req.query.excludeDestS === "1" || req.query.excludeDestS === "true";
    const countOptions = { excludeDestS };

    const [currentDay, currentMonth, currentYear] = await Promise.all([
      getCountsForRange(dayStart, dayEnd, countOptions),
      getCountsForRange(monthStart, monthEnd, countOptions),
      getCountsForRange(yearStart, yearEnd, countOptions),
    ]);

    const response = {
      currentDay: {
        totalCalls: currentDay.totalCalls,
        answered: currentDay.answered,
        ivr: currentDay.ivr,
        dropped: currentDay.dropped,
        lost: currentDay.lost,
      },
      currentMonth: {
        totalCalls: currentMonth.totalCalls,
        answered: currentMonth.answered,
        ivr: currentMonth.ivr,
        dropped: currentMonth.dropped,
        lost: currentMonth.lost,
      },
      currentYear: {
        totalCalls: currentYear.totalCalls,
        answered: currentYear.answered,
        ivr: currentYear.ivr,
        dropped: currentYear.dropped,
        lost: currentYear.lost,
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
  getCountsForAgentByDirection,
};

