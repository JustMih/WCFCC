/**
 * Verify CDR agent_wait_sec from queue_log join.
 * Usage: node scripts/verify-cdr-agent-wait.js [startDate] [endDate]
 */
const sequelize = require("../config/mysql_connection");
const User = require("../models/User");
const {
  ensureCallSummaryReady,
  buildDateRangeWhere,
  buildCdrDestinationWhere,
  buildCdrReportFromClause,
  buildCdrReportSelectList,
  mapRowsToCdrApiShape,
  enrichCdrRowsWithAgentNames,
} = require("../utils/callSummaryReportHelper");

async function main() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);
  const startDate = process.argv[2] || start.toISOString().slice(0, 10);
  const endDate = process.argv[3] || end.toISOString().slice(0, 10);

  await ensureCallSummaryReady(sequelize);
  const dateFilter = buildDateRangeWhere("cs", startDate, endDate);
  const destFilter = buildCdrDestinationWhere("cs");
  const queueWaitOpts = { queueLogDateFilter: true };

  const rows = await sequelize.query(
    `
    SELECT ${buildCdrReportSelectList("cs")}
    ${buildCdrReportFromClause("cs", queueWaitOpts)}
    WHERE ${dateFilter.sql}
      AND ${destFilter.sql}
      AND cs.cdr_status = 'ANSWERED'
      AND cs.agent IS NOT NULL
    ORDER BY cs.call_start DESC
    LIMIT 15
    `,
    {
      replacements: {
        ...dateFilter.replacements,
        ...destFilter.replacements,
        queueLogStart: `${startDate} 00:00:00`,
        queueLogEnd: `${endDate} 23:59:59`,
      },
      type: sequelize.QueryTypes.SELECT,
    }
  );

  const mapped = mapRowsToCdrApiShape(rows);
  const enriched = await enrichCdrRowsWithAgentNames(mapped, User, sequelize);

  const withWait = enriched.filter((r) => r.agent_wait_sec != null);
  console.log(`Range: ${startDate} .. ${endDate}`);
  console.log(`Answered agent rows: ${enriched.length}`);
  console.log(`Rows with agent_wait_sec: ${withWait.length}`);

  const sample = enriched.slice(0, 8).map((r) => ({
    uniqueid: r.uniqueid,
    agent: r.agent_name || r.agent,
    agent_wait_sec: r.agent_wait_sec,
    duration: r.duration,
    billsec: r.billsec,
  }));
  console.log("Sample:", JSON.stringify(sample, null, 2));

  await sequelize.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
