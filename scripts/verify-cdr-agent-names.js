/**
 * Verify CDR agent_name resolution (SQL join + fallback).
 * Usage: node scripts/verify-cdr-agent-names.js [startDate] [endDate]
 */
const sequelize = require("../config/mysql_connection");
const User = require("../models/User");
const {
  ensureCallSummaryReady,
  buildDateRangeWhere,
  buildCdrReportFromClause,
  buildCdrReportSelectList,
  mapRowsToCdrApiShape,
  enrichCdrRowsWithAgentNames,
} = require("../utils/callSummaryReportHelper");

async function main() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);
  const startDate =
    process.argv[2] || start.toISOString().slice(0, 10);
  const endDate =
    process.argv[3] || end.toISOString().slice(0, 10);

  await ensureCallSummaryReady(sequelize);
  const dateFilter = buildDateRangeWhere("cs", startDate, endDate);

  const rows = await sequelize.query(
    `
    SELECT ${buildCdrReportSelectList("cs")}
    ${buildCdrReportFromClause("cs")}
    WHERE ${dateFilter.sql}
      AND cs.agent IS NOT NULL
      AND TRIM(cs.agent) <> ''
    ORDER BY cs.call_start DESC
    LIMIT 50
    `,
    {
      replacements: dateFilter.replacements,
      type: sequelize.QueryTypes.SELECT,
    }
  );

  const mapped = mapRowsToCdrApiShape(rows);
  const enriched = await enrichCdrRowsWithAgentNames(mapped, User, sequelize);

  const withAgent = enriched.length;
  const namedFromSql = mapped.filter((r) => r.agent_name).length;
  const namedAfter = enriched.filter((r) => r.agent_name).length;

  console.log(`Range: ${startDate} .. ${endDate}`);
  console.log(`Rows with agent extension: ${withAgent}`);
  console.log(`agent_name from SQL join: ${namedFromSql}`);
  console.log(`agent_name after fallback: ${namedAfter}`);

  const sample = enriched.slice(0, 8).map((r) => ({
    agent: r.agent_extension || r.agent,
    agent_name: r.agent_name || "-",
  }));
  console.log("Sample:", JSON.stringify(sample, null, 2));

  await sequelize.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
