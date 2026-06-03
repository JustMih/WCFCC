/**
 * Verify ticket workflow TAT report template columns.
 * Usage: node scripts/verify-ticket-workflow-tat.js [startDate] [endDate]
 */
const sequelize = require("../config/mysql_connection");
const { buildHolidaySet } = require("../utils/offHoursHelper");
const { buildTatReportPayload } = require("../utils/ticketWorkflowReportHelper");
const {
  TAT_TEMPLATE_COLUMNS,
  TAT_DIMENSION_COLUMNS,
  LEGACY_COLUMN_KEYS,
} = require("../utils/tatTemplateConfig");

const EXPECTED_COLUMN_COUNT = TAT_TEMPLATE_COLUMNS.length;

function assertTemplateShape(payload) {
  const errors = [];

  if (!Array.isArray(payload.templateColumns)) {
    errors.push("payload.templateColumns missing");
  } else if (payload.templateColumns.length !== EXPECTED_COLUMN_COUNT) {
    errors.push(
      `templateColumns length ${payload.templateColumns.length}, expected ${EXPECTED_COLUMN_COUNT}`
    );
  }

  const expectedKeys = TAT_TEMPLATE_COLUMNS.map((c) => c.key);
  const expectedHeaders = TAT_TEMPLATE_COLUMNS.map((c) => c.header);

  for (let i = 0; i < TAT_TEMPLATE_COLUMNS.length; i++) {
    const col = payload.templateColumns?.[i];
    if (!col) continue;
    if (col.key !== expectedKeys[i]) {
      errors.push(`Column ${i + 1} key mismatch: ${col.key} !== ${expectedKeys[i]}`);
    }
    if (col.header !== expectedHeaders[i]) {
      errors.push(
        `Column ${i + 1} header mismatch: "${col.header}" !== "${expectedHeaders[i]}"`
      );
    }
  }

  for (const row of payload.rows.slice(0, 5)) {
    for (const key of expectedKeys) {
      if (!(key in row)) {
        errors.push(`Row ${row.ticket_number || row.id} missing key: ${key}`);
        break;
      }
    }
    for (const dim of TAT_DIMENSION_COLUMNS) {
      if (row[dim.key] === undefined) {
        errors.push(
          `Row ${row.ticket_number || row.id} missing dimension: ${dim.key}`
        );
        break;
      }
    }
    for (const legacyKey of LEGACY_COLUMN_KEYS) {
      if (legacyKey in row) {
        errors.push(
          `Row ${row.ticket_number || row.id} still has legacy key: ${legacyKey}`
        );
        break;
      }
    }
  }

  return errors;
}

async function main() {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - 3);
  const startDate = process.argv[2] || start.toISOString().slice(0, 10);
  const endDate = process.argv[3] || end.toISOString().slice(0, 10);

  const tickets = await sequelize.query(
    `
    SELECT t.*, u2.full_name AS creator_name, u2.role AS creator_role
    FROM Tickets t
    LEFT JOIN Users u2 ON t.created_by = u2.id
    WHERE t.created_at BETWEEN CONCAT(:startDate, ' 00:00:00') AND CONCAT(:endDate, ' 23:59:59')
      AND EXISTS (
        SELECT 1 FROM Ticket_assignments ta WHERE ta.ticket_id = t.id
      )
    ORDER BY t.created_at DESC
    LIMIT 20
    `,
    {
      replacements: { startDate, endDate },
      type: sequelize.QueryTypes.SELECT,
    }
  );

  const ticketIds = tickets.map((t) => t.id).filter(Boolean);
  let assignments = [];
  if (ticketIds.length) {
    assignments = await sequelize.query(
      `
      SELECT ta.*, u.full_name AS assigned_to_name, u.role AS assigned_user_role
      FROM Ticket_assignments ta
      LEFT JOIN Users u ON u.id = ta.assigned_to_id
      WHERE ta.ticket_id IN (:ticketIds)
      ORDER BY ta.created_at ASC
      `,
      {
        replacements: { ticketIds },
        type: sequelize.QueryTypes.SELECT,
      }
    );
  }

  const payload = buildTatReportPayload(tickets, assignments);
  const shapeErrors = assertTemplateShape(payload);

  const [countRow] = await sequelize.query(
    `
    SELECT COUNT(*) AS c
    FROM Tickets t
    WHERE EXISTS (SELECT 1 FROM Ticket_assignments ta WHERE ta.ticket_id = t.id)
    `,
    { type: sequelize.QueryTypes.SELECT }
  );

  console.log(`Range: ${startDate} .. ${endDate}`);
  console.log(`All-time tickets with assignments: ${countRow?.c ?? 0}`);
  console.log(`Template columns: ${payload.templateColumns?.length ?? 0}`);
  console.log("Summary:", JSON.stringify(payload.summary, null, 2));

  if (shapeErrors.length) {
    console.error("Template shape errors:");
    shapeErrors.forEach((e) => console.error(`  - ${e}`));
    process.exitCode = 1;
  } else {
    console.log(`Template shape: OK (${EXPECTED_COLUMN_COUNT} columns)`);
  }

  const withChannel = payload.rows.filter(
    (r) => r.channel != null && String(r.channel).trim() !== ""
  );
  if (payload.rows.length > 0 && withChannel.length === 0) {
    console.warn(
      "Warning: no rows have channel populated (check Tickets.channel and creator_role join)"
    );
  } else {
    console.log(
      `Rows with channel: ${withChannel.length} / ${payload.rows.length}`
    );
  }

  const sample = payload.rows.slice(0, 2).map((r) => {
    const out = { ticket_number: r.ticket_number, status: r.status };
    for (const col of TAT_TEMPLATE_COLUMNS) {
      out[col.key] = r[col.key];
    }
    return out;
  });
  console.log("Sample rows:", JSON.stringify(sample, null, 2));

  if (payload.rows[0]) {
    console.log(
      "Sample tat_overall (working days, excl. weekends/holidays):",
      payload.rows[0].tat_overall
    );
  }

  await sequelize.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
