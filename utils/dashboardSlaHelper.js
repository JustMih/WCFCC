const { QueryTypes } = require("sequelize");
const {
  buildCdrDestinationWhere,
  buildCdrQueueWaitJoin,
  buildCdrQueueWaitReplacements,
  buildAgentWaitSecExpr,
} = require("./callSummaryReportHelper");
const {
  countTodayMissedCalls,
  countQueueDroppedInRange,
  countMissedCallsInRange,
  getTodayBounds,
} = require("./missedCallHelper");
const { buildSlaMetricsFromRow } = require("./slaMetricsHelper");

const VIEW_NAME = "call_summary";

function dayBoundsFromDateString(dateStr) {
  return {
    start: `${dateStr} 00:00:00`,
    end: `${dateStr} 23:59:59`,
  };
}

function enumerateDates(startDate, endDate) {
  const dates = [];
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  const current = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));

  while (current <= end) {
    const y = current.getUTCFullYear();
    const m = String(current.getUTCMonth() + 1).padStart(2, "0");
    const d = String(current.getUTCDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

async function queryAgentAnsweredCount(sequelize, dayStart, dayEnd) {
  const destFilter = buildCdrDestinationWhere("cs", "called");
  const [answeredRow] = await sequelize.query(
    `
    SELECT COUNT(*) AS answered
    FROM ${VIEW_NAME} cs
    WHERE cs.call_start BETWEEN :dayStart AND :dayEnd
      AND cs.status = 'ANSWERED'
      AND cs.agent IS NOT NULL
      AND ${destFilter.sql}
    `,
    {
      replacements: { dayStart, dayEnd, ...destFilter.replacements },
      type: QueryTypes.SELECT,
    }
  );
  return Number(answeredRow?.answered) || 0;
}

/**
 * Agent-answered SLA stats for a day using queue_log speed-to-answer.
 */
async function queryAgentAnsweredSlaStats(sequelize, dayStart, dayEnd) {
  const destFilter = buildCdrDestinationWhere("cs", "called");
  const waitExpr = buildAgentWaitSecExpr();
  const queueWaitOpts = { queueLogDateFilter: true };
  const dayDate = dayStart.slice(0, 10);
  const queueReplacements = buildCdrQueueWaitReplacements(dayDate, dayDate);

  const [row] = await sequelize.query(
    `
    SELECT
      COUNT(*) AS answered,
      SUM(
        CASE
          WHEN (${waitExpr}) IS NOT NULL AND (${waitExpr}) <= 20 THEN 1
          ELSE 0
        END
      ) AS answered_within_20s,
      AVG(
        CASE
          WHEN (${waitExpr}) IS NOT NULL THEN (${waitExpr})
          ELSE NULL
        END
      ) AS avg_response_sec,
      AVG(cs.billsec) AS avg_handle_sec
    FROM ${VIEW_NAME} cs
    ${buildCdrQueueWaitJoin("cs", queueWaitOpts)}
    WHERE cs.call_start BETWEEN :dayStart AND :dayEnd
      AND cs.status = 'ANSWERED'
      AND cs.agent IS NOT NULL
      AND ${destFilter.sql}
    `,
    {
      replacements: {
        dayStart,
        dayEnd,
        ...destFilter.replacements,
        ...queueReplacements,
      },
      type: QueryTypes.SELECT,
    }
  );

  return row || {};
}

/**
 * Build full SLA metrics row from pre-computed call statistics counts.
 */
function buildDashboardSlaMetrics({
  answered,
  lost,
  dropped,
  agentStats = {},
  date,
}) {
  const answeredCount = Number(answered) || 0;
  const lostCount = Number(lost) || 0;
  const droppedCount = Number(dropped) || 0;
  const within20 = Number(agentStats.answered_within_20s) || 0;
  const total = answeredCount + lostCount + droppedCount;
  const notAnswered = lostCount + droppedCount;

  const metrics = buildSlaMetricsFromRow(
    {
      total,
      answered: answeredCount,
      answered_within_20s: within20,
      not_answered: notAnswered,
      avg_response_sec: agentStats.avg_response_sec,
      avg_handle_sec: agentStats.avg_handle_sec,
    },
    date
  );

  return {
    ...metrics,
    lostCalls: lostCount,
    droppedCalls: droppedCount,
  };
}

function toWallboardSlaPayload(metrics) {
  return {
    serviceLevel: metrics.serviceLevel,
    abandonmentRate: metrics.abandonmentRate,
    averageResponseTime: metrics.averageResponseTime,
    averageHandleTime: metrics.averageHandleTime,
  };
}

/**
 * SLA metrics for one calendar day (same pipeline as public dashboard).
 */
async function getDashboardSlaMetricsForDay(sequelize, dayStart, dayEnd, dateLabel) {
  const [answered, lost, dropped, agentStats] = await Promise.all([
    queryAgentAnsweredCount(sequelize, dayStart, dayEnd),
    countMissedCallsInRange(sequelize, dayStart, dayEnd),
    countQueueDroppedInRange(sequelize, dayStart, dayEnd),
    queryAgentAnsweredSlaStats(sequelize, dayStart, dayEnd),
  ]);

  return buildDashboardSlaMetrics({
    answered,
    lost,
    dropped,
    agentStats,
    date: dateLabel,
  });
}

function rollupDailyMetrics(dailyRows) {
  if (!dailyRows.length) {
    return buildSlaMetricsFromRow({
      total: 0,
      answered: 0,
      answered_within_20s: 0,
      not_answered: 0,
      avg_response_sec: 0,
      avg_handle_sec: 0,
    });
  }

  const totalAnswered = dailyRows.reduce(
    (sum, row) => sum + (Number(row.answeredCalls) || 0),
    0
  );
  const totalLost = dailyRows.reduce(
    (sum, row) => sum + (Number(row.lostCalls) || 0),
    0
  );
  const totalDropped = dailyRows.reduce(
    (sum, row) => sum + (Number(row.droppedCalls) || 0),
    0
  );
  const totalWithin20 = dailyRows.reduce(
    (sum, row) => sum + (Number(row.answeredWithin20s) || 0),
    0
  );

  let responseWeightedSum = 0;
  let handleWeightedSum = 0;
  let weight = 0;
  for (const row of dailyRows) {
    const answered = Number(row.answeredCalls) || 0;
    if (answered > 0) {
      responseWeightedSum += (Number(row.averageResponseTime) || 0) * answered;
      handleWeightedSum += (Number(row.averageHandleTime) || 0) * answered;
      weight += answered;
    }
  }

  const total = totalAnswered + totalLost + totalDropped;

  return buildSlaMetricsFromRow({
    total,
    answered: totalAnswered,
    answered_within_20s: totalWithin20,
    not_answered: totalLost + totalDropped,
    avg_response_sec: weight > 0 ? responseWeightedSum / weight : 0,
    avg_handle_sec: weight > 0 ? handleWeightedSum / weight : 0,
  });
}

/**
 * SLA report summary + daily rows for a date range (dashboard-aligned).
 */
async function getDashboardSlaReportForRange(sequelize, startDate, endDate) {
  const dates = enumerateDates(startDate, endDate);
  const daily = [];

  for (const dateStr of dates) {
    const { start, end } = dayBoundsFromDateString(dateStr);
    const row = await getDashboardSlaMetricsForDay(sequelize, start, end, dateStr);
    daily.push(row);
  }

  const summary = rollupDailyMetrics(daily);
  return { summary, daily };
}

/**
 * Today's SLA metrics aligned with the public dashboard Call Statistics panel.
 * Pass precomputed { answered, lost, dropped } when already loaded in call-summary.
 */
async function getTodayDashboardSlaMetrics(sequelize, precomputed = null) {
  const { start: dayStart, end: dayEnd } = getTodayBounds();
  const dateLabel = dayStart.slice(0, 10);

  if (precomputed) {
    const agentStats = await queryAgentAnsweredSlaStats(sequelize, dayStart, dayEnd);
    return toWallboardSlaPayload(
      buildDashboardSlaMetrics({
        answered: precomputed.answered,
        lost: precomputed.lost,
        dropped: precomputed.dropped,
        agentStats,
        date: dateLabel,
      })
    );
  }

  const metrics = await getDashboardSlaMetricsForDay(
    sequelize,
    dayStart,
    dayEnd,
    dateLabel
  );
  return toWallboardSlaPayload(metrics);
}

module.exports = {
  dayBoundsFromDateString,
  enumerateDates,
  queryAgentAnsweredCount,
  queryAgentAnsweredSlaStats,
  buildDashboardSlaMetrics,
  getDashboardSlaMetricsForDay,
  getDashboardSlaReportForRange,
  getTodayDashboardSlaMetrics,
};
