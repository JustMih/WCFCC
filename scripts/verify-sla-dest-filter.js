const sequelize = require("../config/mysql_connection");
const { buildSlaMetricsFromRow } = require("../utils/slaMetricsHelper");
const {
  getTodayDashboardSlaMetrics,
  getDashboardSlaReportForRange,
  buildDashboardSlaMetrics,
  queryAgentAnsweredSlaStats,
} = require("../utils/dashboardSlaHelper");
const {
  countTodayMissedCalls,
  countQueueDroppedInRange,
  getTodayBounds,
} = require("../utils/missedCallHelper");
const { QueryTypes } = require("sequelize");
const { buildCdrDestinationWhere, VIEW_NAME } = require("../utils/callSummaryReportHelper");

function assertEqual(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
  console.log(`  OK ${label}: ${actual}`);
}

function testBuildSlaMetricsFromRowFormula() {
  console.log("\n--- buildSlaMetricsFromRow formula (within20 / total) ---");

  const zeroWithin20 = buildSlaMetricsFromRow({
    total: 4,
    answered: 0,
    answered_within_20s: 0,
    not_answered: 4,
  });
  assertEqual("serviceLevel when 0 within20 / 4 total", zeroWithin20.serviceLevel, 0);
  assertEqual("abandonment when 4/4 not answered", zeroWithin20.abandonmentRate, 100);

  const partial = buildSlaMetricsFromRow({
    total: 4,
    answered: 2,
    answered_within_20s: 2,
    not_answered: 2,
  });
  assertEqual("serviceLevel when 2 within20 / 4 total", partial.serviceLevel, 50);
  assertEqual("abandonment when 2/4 not answered", partial.abandonmentRate, 50);
}

function testWallboardScenario() {
  console.log("\n--- wallboard scenario (6 answered, 0 lost, 4 dropped, 3 within20) ---");

  const metrics = buildDashboardSlaMetrics({
    answered: 6,
    lost: 0,
    dropped: 4,
    agentStats: {
      answered_within_20s: 3,
      avg_response_sec: 46,
      avg_handle_sec: 98,
    },
  });

  assertEqual("serviceLevel", metrics.serviceLevel, 30);
  assertEqual("abandonmentRate", metrics.abandonmentRate, 40);
  assertEqual("totalCalls", metrics.totalCalls, 10);
  assertEqual("answeredCalls", metrics.answeredCalls, 6);
  assertEqual("answeredWithin20s", metrics.answeredWithin20s, 3);
  assertEqual("notAnsweredCalls", metrics.notAnsweredCalls, 4);
}

async function verifyDashboardSlaConsistency() {
  console.log("\n--- dashboard SLA vs call statistics (today) ---");

  const { start: dayStart, end: dayEnd } = getTodayBounds();
  const destFilter = buildCdrDestinationWhere("", "called");

  const [answeredRow] = await sequelize.query(
    `
    SELECT COUNT(*) AS answered
    FROM ${VIEW_NAME}
    WHERE call_start BETWEEN :dayStart AND :dayEnd
      AND status = 'ANSWERED'
      AND agent IS NOT NULL
      AND ${destFilter.sql}
    `,
    {
      replacements: { dayStart, dayEnd, ...destFilter.replacements },
      type: QueryTypes.SELECT,
    }
  );

  const answered = Number(answeredRow?.answered) || 0;
  const lost = Number(await countTodayMissedCalls(sequelize)) || 0;
  const dropped =
    Number(await countQueueDroppedInRange(sequelize, dayStart, dayEnd)) || 0;
  const expectedTotal = answered + lost + dropped;

  const agentStats = await queryAgentAnsweredSlaStats(sequelize, dayStart, dayEnd);
  const within20 = Number(agentStats.answered_within_20s) || 0;

  const wallboard = await getTodayDashboardSlaMetrics(sequelize, {
    answered,
    lost,
    dropped,
  });

  const expectedServiceLevel =
    expectedTotal > 0 ? Math.round((within20 / expectedTotal) * 100) : 0;
  const expectedAbandonment =
    expectedTotal > 0
      ? Math.round(((lost + dropped) / expectedTotal) * 100)
      : 0;

  assertEqual("serviceLevel", wallboard.serviceLevel, expectedServiceLevel);
  assertEqual("abandonmentRate", wallboard.abandonmentRate, expectedAbandonment);

  console.log(
    `  breakdown: answered=${answered}, within20=${within20}, lost=${lost}, dropped=${dropped}, total=${expectedTotal}`
  );
}

async function verifyReportMatchesDashboardToday() {
  console.log("\n--- SLA report summary matches dashboard (today) ---");

  const today = getTodayBounds().start.slice(0, 10);
  const wallboard = await getTodayDashboardSlaMetrics(sequelize);
  const { summary } = await getDashboardSlaReportForRange(
    sequelize,
    today,
    today
  );

  assertEqual("report serviceLevel", summary.serviceLevel, wallboard.serviceLevel);
  assertEqual(
    "report abandonmentRate",
    summary.abandonmentRate,
    wallboard.abandonmentRate
  );
  assertEqual(
    "report averageResponseTime",
    summary.averageResponseTime,
    wallboard.averageResponseTime
  );
  assertEqual(
    "report averageHandleTime",
    summary.averageHandleTime,
    wallboard.averageHandleTime
  );

  const { start: dayStart, end: dayEnd } = getTodayBounds();
  const answered = await sequelize.query(
    `
    SELECT COUNT(*) AS answered
    FROM ${VIEW_NAME}
    WHERE call_start BETWEEN :dayStart AND :dayEnd
      AND status = 'ANSWERED'
      AND agent IS NOT NULL
      AND ${buildCdrDestinationWhere("", "called").sql}
    `,
    {
      replacements: {
        dayStart,
        dayEnd,
        ...buildCdrDestinationWhere("", "called").replacements,
      },
      type: QueryTypes.SELECT,
    }
  );
  const lost = await countTodayMissedCalls(sequelize);
  const dropped = await countQueueDroppedInRange(sequelize, dayStart, dayEnd);
  const expectedTotal =
    Number(answered[0]?.answered || 0) + Number(lost || 0) + Number(dropped || 0);

  assertEqual("report totalCalls matches pipeline", summary.totalCalls, expectedTotal);
}

async function main() {
  testBuildSlaMetricsFromRowFormula();
  testWallboardScenario();
  await verifyDashboardSlaConsistency();
  await verifyReportMatchesDashboardToday();
  await sequelize.close();
  console.log("\nAll SLA verification checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
