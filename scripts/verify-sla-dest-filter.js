const sequelize = require("../config/mysql_connection");
const {
  ensureCallSummaryReady,
  buildDateRangeWhereBound,
  buildSlaAggregateSelect,
  buildCdrDestinationWhere,
  VIEW_NAME,
} = require("../utils/callSummaryReportHelper");
const { buildSlaMetricsFromRow } = require("../utils/slaMetricsHelper");

async function main() {
  const startDate = "2026-05-01";
  const endDate = "2026-05-29";
  await ensureCallSummaryReady(sequelize);
  const slaSelect = buildSlaAggregateSelect();
  const dateFilter = buildDateRangeWhereBound(
    "cs",
    `${startDate} 00:00:00`,
    `${endDate} 23:59:59`
  );
  const destFilter = buildCdrDestinationWhere("cs");

  const [allRow] = await sequelize.query(
    `SELECT ${slaSelect} FROM ${VIEW_NAME} cs WHERE ${dateFilter.sql}`,
    { replacements: dateFilter.replacements, type: sequelize.QueryTypes.SELECT }
  );
  const [filteredRow] = await sequelize.query(
    `SELECT ${slaSelect} FROM ${VIEW_NAME} cs WHERE ${dateFilter.sql} AND ${destFilter.sql}`,
    {
      replacements: { ...dateFilter.replacements, ...destFilter.replacements },
      type: sequelize.QueryTypes.SELECT,
    }
  );

  const [sCount] = await sequelize.query(
    `SELECT COUNT(*) AS c FROM ${VIEW_NAME} cs WHERE ${dateFilter.sql} AND TRIM(UPPER(cs.called)) = 'S'`,
    { replacements: dateFilter.replacements, type: sequelize.QueryTypes.SELECT }
  );

  console.log("S/s destination rows excluded:", sCount.c);
  console.log("Total calls (all):", buildSlaMetricsFromRow(allRow).totalCalls);
  console.log(
    "Total calls (filtered):",
    buildSlaMetricsFromRow(filteredRow).totalCalls
  );

  await sequelize.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
