const sequelize = require("../config/mysql_connection");
const {
  ensureCallSummaryReady,
  buildDateRangeWhere,
  buildCdrDestinationWhere,
  buildCdrReportFromClause,
} = require("../utils/callSummaryReportHelper");

(async () => {
  await ensureCallSummaryReady(sequelize);
  const start = "2026-05-01";
  const end = "2026-05-30";
  const dateFilter = buildDateRangeWhere("cs", start, end);
  const destFilter = buildCdrDestinationWhere("cs", "called");

  const [filtered] = await sequelize.query(
    `SELECT COUNT(*) AS c ${buildCdrReportFromClause("cs")} WHERE ${dateFilter.sql} AND ${destFilter.sql}`,
    { replacements: dateFilter.replacements, type: sequelize.QueryTypes.SELECT }
  );
  const [total] = await sequelize.query(
    `SELECT COUNT(*) AS c FROM call_summary cs WHERE ${dateFilter.sql}`,
    { replacements: dateFilter.replacements, type: sequelize.QueryTypes.SELECT }
  );
  const [cdrRaw] = await sequelize.query(
    "SELECT COUNT(*) AS c FROM cdr WHERE cdrstarttime BETWEEN CONCAT(:start, ' 00:00:00') AND CONCAT(:end, ' 23:59:59')",
    { replacements: { start, end }, type: sequelize.QueryTypes.SELECT }
  );

  console.log({ call_summary_filtered: filtered.c, call_summary_total: total.c, cdr_raw: cdrRaw.c });
  await sequelize.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
