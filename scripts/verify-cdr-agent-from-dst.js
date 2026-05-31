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
  await ensureCallSummaryReady(sequelize);
  const dateFilter = buildDateRangeWhere("cs", "2026-05-22", "2026-05-29");

  const rows = await sequelize.query(
    `
    SELECT ${buildCdrReportSelectList("cs")}
    ${buildCdrReportFromClause("cs")}
    WHERE ${dateFilter.sql}
      AND (cs.agent IS NULL OR TRIM(cs.agent) = '')
      AND cs.called REGEXP '^[0-9]{3,6}$'
    ORDER BY cs.call_start DESC
    LIMIT 30
    `,
    {
      replacements: dateFilter.replacements,
      type: sequelize.QueryTypes.SELECT,
    }
  );

  const mapped = mapRowsToCdrApiShape(rows);
  const enriched = await enrichCdrRowsWithAgentNames(mapped, User, sequelize);
  const named = enriched.filter((r) => r.agent_name);

  console.log(`Rows (no agent, dst is ext): ${enriched.length}`);
  console.log(`With agent_name: ${named.length}`);
  console.log(
    enriched.slice(0, 10).map((r) => ({
      dst: r.dst,
      agent_extension: r.agent_extension,
      agent_name: r.agent_name || "-",
    }))
  );

  await sequelize.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
