/**
 * Some DBs (e.g. local dev) have cdr without linkedid; production Asterisk often has both.
 */

let cachedHasLinkedid = null;

async function cdrHasLinkedIdColumn(sequelize) {
  if (cachedHasLinkedid !== null) return cachedHasLinkedid;
  try {
    const rows = await sequelize.query(
      `
      SELECT COUNT(*) AS cnt
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'cdr'
        AND COLUMN_NAME = 'linkedid'
      `,
      { type: sequelize.QueryTypes.SELECT }
    );
    cachedHasLinkedid = Number(rows[0]?.cnt) > 0;
  } catch {
    cachedHasLinkedid = false;
  }
  return cachedHasLinkedid;
}

/** SQL expression for one call session key from cdr row */
async function getCdrSessionIdExpr(sequelize, alias = "c") {
  const hasLinkedid = await cdrHasLinkedIdColumn(sequelize);
  if (hasLinkedid) {
    return `COALESCE(NULLIF(TRIM(${alias}.linkedid), ''), ${alias}.uniqueid)`;
  }
  return `${alias}.uniqueid`;
}

/** Comma-prefixed column list fragment e.g. "linkedid, " or "" */
async function getCdrLinkedidSelect(sequelize) {
  const has = await cdrHasLinkedIdColumn(sequelize);
  return has ? "linkedid, " : "";
}

function resetCdrSchemaCache() {
  cachedHasLinkedid = null;
}

module.exports = {
  cdrHasLinkedIdColumn,
  getCdrSessionIdExpr,
  getCdrLinkedidSelect,
  resetCdrSchemaCache,
};
