/**
 * Report queries against MySQL view `call_summary` (session-level calls).
 *
 * View columns (verified via DESCRIBE):
 * uniqueid, call_start, call_end, caller, called, direction,
 * total_duration, billsec, cdr_status, status, queue, agent
 *
 * - call_start: session start (maps to API cdrstarttime)
 * - status: answered | lost | dropped → API disposition field
 * - cdr_status: Asterisk disposition (ANSWERED, NO ANSWER, …) kept separate
 * - agent: extension for agent-attributed calls
 */

const { Op } = require("sequelize");
const { normalizeExtensionCandidate } = require("./agentExtensionHelper");

const VIEW_NAME = "call_summary";

let cachedColumns = null;
let cachedSchema = null;

function buildStatusFilterSql(alias, statusValue) {
  const col = qualify(alias, "status");
  return {
    sql: `LOWER(${col}) = '${statusValue}'`,
    replacements: {},
  };
}

const LEGACY_DISPOSITION_TO_STATUS = {
  ANSWERED: "answered",
  "NO ANSWER": "lost",
  BUSY: "dropped",
  FAILED: "dropped",
};

function normalizeCallStatus(value) {
  if (value == null || value === "") return null;
  const lower = String(value).trim().toLowerCase();
  if (lower === "answered" || lower === "lost" || lower === "dropped") {
    return lower;
  }
  const legacy = LEGACY_DISPOSITION_TO_STATUS[String(value).trim().toUpperCase()];
  return legacy ?? null;
}

function normalizeDispositionFilter(disposition) {
  if (!disposition || disposition === "all") return null;
  const lower = String(disposition).trim().toLowerCase();
  if (lower === "answered" || lower === "lost" || lower === "dropped") {
    return lower;
  }
  const legacy =
    LEGACY_DISPOSITION_TO_STATUS[String(disposition).trim().toUpperCase()];
  return legacy ?? null;
}

async function loadCallSummaryColumns(sequelize) {
  if (cachedColumns) return cachedColumns;

  const rows = await sequelize.query(
    `
    SELECT COLUMN_NAME AS name
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = :viewName
    ORDER BY ORDINAL_POSITION
    `,
    {
      replacements: { viewName: VIEW_NAME },
      type: sequelize.QueryTypes.SELECT,
    }
  );

  cachedColumns = rows.map((r) => String(r.name).toLowerCase());
  if (cachedColumns.length === 0) {
    throw new Error(
      `Database view "${VIEW_NAME}" was not found. Create or deploy call_summary before using CDR reports.`
    );
  }

  cachedSchema = {
    columns: cachedColumns,
    timeColumn: pickColumn(cachedColumns, ["call_start", "cdrstarttime"]),
    dispositionColumn: pickColumn(cachedColumns, [
      "status",
      "disposition",
      "cdr_status",
    ]),
    agentColumn: pickColumn(cachedColumns, ["agent", "src"]),
    durationColumn: pickColumn(cachedColumns, [
      "total_duration",
      "duration",
    ]),
    billsecColumn: pickColumn(cachedColumns, ["billsec"]),
  };

  if (!cachedSchema.timeColumn) {
    throw new Error(
      `View "${VIEW_NAME}" is missing a time column (expected call_start).`
    );
  }

  return cachedColumns;
}

function pickColumn(columns, candidates) {
  for (const name of candidates) {
    if (columns.includes(name.toLowerCase())) return name;
  }
  return null;
}

async function ensureCallSummaryReady(sequelize) {
  await loadCallSummaryColumns(sequelize);
  return cachedSchema;
}

function getSchema() {
  if (!cachedSchema) {
    throw new Error(
      "call_summary schema not loaded; call ensureCallSummaryReady(sequelize) first."
    );
  }
  return cachedSchema;
}

function qualify(alias, column) {
  return alias ? `${alias}.${column}` : column;
}

function buildDateRangeWhere(alias, startDate, endDate) {
  const schema = getSchema();
  const col = qualify(alias, schema.timeColumn);
  return {
    sql: `${col} >= CONCAT(:startDate, ' 00:00:00') AND ${col} < DATE_ADD(CONCAT(:endDate, ' 00:00:00'), INTERVAL 1 DAY)`,
    replacements: { startDate, endDate },
  };
}

function buildDateRangeWhereBound(alias, startDateTime, endDateTime) {
  const schema = getSchema();
  const col = qualify(alias, schema.timeColumn);
  return {
    sql: `${col} BETWEEN :startDate AND :endDate`,
    replacements: { startDate: startDateTime, endDate: endDateTime },
  };
}

/**
 * @param {string} disposition - route param: all | answered | lost | dropped (legacy Asterisk values accepted)
 * @param {string} [alias='cs'] - call_summary table alias (required when Users is joined)
 * @returns {{ sql: string, replacements: object } | null}
 */
function buildDispositionWhere(disposition, alias = "cs") {
  if (!disposition || disposition === "all") return null;

  const normalizedFilter = normalizeDispositionFilter(disposition);
  if (!normalizedFilter) {
    console.warn(
      `[callSummaryReportHelper] Unmapped disposition filter "${disposition}"; returning no rows.`
    );
    return { sql: "1 = 0", replacements: {} };
  }

  return buildStatusFilterSql(alias, normalizedFilter);
}

/**
 * Exclude non-agent placeholder destinations (S/s, I/i, T/t) from CDR reports.
 * @param {string} alias - table alias for call_summary / cdr
 * @param {string} [column='called'] - destination column (`called` on call_summary, `dst` on cdr)
 * @returns {{ sql: string, replacements: object }}
 */
function buildCdrDestinationWhere(alias = "cs", column = "called") {
  const col = qualify(alias, column);
  return {
    sql: `(${col} IS NULL OR TRIM(UPPER(${col})) NOT IN ('S', 'I', 'T'))`,
    replacements: {},
  };
}

/** Extension from call_summary.agent, else destination when it looks like an agent ext (e.g. 1002). */
function pickAgentExtensionForRow(row) {
  if (!row) return null;
  const fromAgent = row.agent_extension ?? row.agent;
  if (fromAgent != null && String(fromAgent).trim() !== "") {
    const normalized = normalizeExtensionCandidate(fromAgent);
    if (normalized) return normalized;
  }
  for (const field of [row.dst ?? row.called, row.src ?? row.caller]) {
    const normalized = normalizeExtensionCandidate(field);
    if (normalized) return normalized;
  }
  return null;
}

function buildCdrQueueWaitReplacements(startDate, endDate) {
  return {
    queueLogStart: `${startDate} 00:00:00`,
    queueLogEnd: `${endDate} 23:59:59`,
  };
}

function buildCdrQueueWaitJoin(alias = "cs", options = {}) {
  const a = alias;
  const queueLogWhere = options.queueLogDateFilter
    ? "WHERE time BETWEEN :queueLogStart AND :queueLogEnd"
    : "WHERE time >= DATE_SUB(NOW(), INTERVAL 90 DAY)";
  return `
    LEFT JOIN (
      SELECT
        callid,
        MAX(
          CASE
            WHEN event IN ('CONNECT', 'AGENTCONNECT')
              AND TRIM(data1) REGEXP '^[0-9]+$'
              AND CAST(TRIM(data1) AS UNSIGNED) <= 7200
            THEN CAST(TRIM(data1) AS UNSIGNED)
          END
        ) AS queue_hold_sec,
        MIN(
          CASE
            WHEN event IN ('ENTERQUEUE', 'QUEUEENTRY') THEN time
          END
        ) AS queue_enter_time,
        MIN(
          CASE
            WHEN event IN ('CONNECT', 'AGENTCONNECT') THEN time
          END
        ) AS agent_connect_time
      FROM queue_log
      ${queueLogWhere}
      GROUP BY callid
    ) ql_wait ON ql_wait.callid = ${a}.uniqueid`;
}

function buildCdrAgentWaitSelect() {
  return `
    CASE
      WHEN ql_wait.queue_enter_time IS NOT NULL AND ql_wait.agent_connect_time IS NOT NULL
        THEN GREATEST(
          TIMESTAMPDIFF(SECOND, ql_wait.queue_enter_time, ql_wait.agent_connect_time),
          0
        )
      WHEN ql_wait.queue_hold_sec IS NOT NULL AND ql_wait.queue_hold_sec >= 0
        THEN ql_wait.queue_hold_sec
      ELSE NULL
    END AS agent_wait_sec`;
}

function buildCdrReportFromClause(alias = "cs", options = {}) {
  const a = alias;
  return `
    FROM ${VIEW_NAME} ${a}
    LEFT JOIN Users u_agent
      ON ${a}.agent IS NOT NULL
      AND TRIM(${a}.agent) <> ''
      AND (
        u_agent.extension = CAST(${a}.agent AS UNSIGNED)
        OR CAST(u_agent.extension AS CHAR) COLLATE utf8mb4_unicode_ci
          = TRIM(${a}.agent) COLLATE utf8mb4_unicode_ci
      )
    LEFT JOIN Users u_dst
      ON (${a}.agent IS NULL OR TRIM(${a}.agent) = '')
      AND ${a}.called IS NOT NULL
      AND TRIM(${a}.called) REGEXP '^[0-9]{3,6}$'
      AND TRIM(${a}.called) NOT REGEXP '^0+$'
      AND (
        u_dst.extension = CAST(TRIM(${a}.called) AS UNSIGNED)
        OR CAST(u_dst.extension AS CHAR) COLLATE utf8mb4_unicode_ci
          = TRIM(${a}.called) COLLATE utf8mb4_unicode_ci
      )${buildCdrQueueWaitJoin(a, options)}`;
}

function buildCdrReportSelectList(alias = "cs") {
  const a = alias;
  return `
    ${a}.uniqueid,
    ${a}.uniqueid AS id,
    ${a}.call_start AS cdrstarttime,
    ${a}.call_end,
    ${a}.caller AS clid,
    ${a}.caller AS src,
    ${a}.called AS dst,
    ${a}.direction,
    ${a}.total_duration AS duration,
    ${a}.billsec,
    ${a}.status AS disposition,
    ${a}.cdr_status,
    ${a}.queue,
    COALESCE(u_agent.full_name, u_dst.full_name) AS agent_name,
    ${a}.agent AS agent_extension,
    ${a}.agent,
    ${buildCdrAgentWaitSelect()},
    NULL AS recordingfile
  `;
}

function mapRowToCdrApiShape(row) {
  if (!row) return row;
  const disposition = normalizeCallStatus(row.disposition ?? row.status);

  return {
    ...row,
    id: row.id ?? row.uniqueid ?? null,
    cdrstarttime: row.cdrstarttime ?? row.call_start ?? null,
    clid: row.clid ?? row.caller ?? null,
    src: row.src ?? row.caller ?? null,
    dst: row.dst ?? row.called ?? null,
    duration:
      row.duration != null
        ? row.duration
        : row.total_duration != null
          ? row.total_duration
          : null,
    disposition,
    cdr_status: row.cdr_status ?? null,
    agent_extension: pickAgentExtensionForRow(row),
    agent_name: row.agent_name || null,
    agent_wait_sec:
      row.agent_wait_sec != null && row.agent_wait_sec !== ""
        ? Number(row.agent_wait_sec)
        : null,
    talk_time_sec: (() => {
      const wait =
        row.agent_wait_sec != null && row.agent_wait_sec !== ""
          ? Number(row.agent_wait_sec)
          : null;
      if (wait == null || Number.isNaN(wait)) return 0;
      const total =
        row.duration != null
          ? Number(row.duration)
          : row.total_duration != null
            ? Number(row.total_duration)
            : NaN;
      if (!Number.isFinite(total)) return 0;
      return Math.max(0, total - wait);
    })(),
  };
}

function mapRowsToCdrApiShape(rows) {
  return (rows || []).map(mapRowToCdrApiShape);
}

function buildSlaAggregateSelect() {
  const schema = getSchema();
  const durationCol = schema.durationColumn || "total_duration";
  const billsecCol = schema.billsecColumn || "billsec";

  const answeredExpr =
    schema.dispositionColumn === "disposition"
      ? "disposition = 'ANSWERED'"
      : "cdr_status = 'ANSWERED'";

  const notAnsweredExpr =
    schema.dispositionColumn === "disposition"
      ? "disposition != 'ANSWERED'"
      : "cdr_status != 'ANSWERED'";

  return `
  COUNT(*) AS total,
  SUM(CASE WHEN ${answeredExpr} THEN 1 ELSE 0 END) AS answered,
  SUM(
    CASE
      WHEN ${answeredExpr} AND COALESCE(${durationCol}, 0) <= 20 THEN 1
      ELSE 0
    END
  ) AS answered_within_20s,
  SUM(CASE WHEN ${notAnsweredExpr} THEN 1 ELSE 0 END) AS not_answered,
  AVG(CASE WHEN ${answeredExpr} THEN ${durationCol} END) AS avg_response_sec,
  AVG(CASE WHEN ${answeredExpr} THEN ${billsecCol} END) AS avg_handle_sec
`;
}

function buildCallSummaryAggregateSelect() {
  return `
    DATE(call_start) AS date,
    COUNT(*) AS total_calls,
    SUM(
      CASE
        WHEN LOWER(status) = 'answered' OR cdr_status = 'ANSWERED' THEN 1
        ELSE 0
      END
    ) AS answered,
    SUM(CASE WHEN LOWER(status) = 'lost' THEN 1 ELSE 0 END) AS no_answer,
    SUM(
      CASE
        WHEN LOWER(status) = 'dropped' OR cdr_status = 'BUSY' THEN 1
        ELSE 0
      END
    ) AS busy,
    SUM(COALESCE(total_duration, 0)) AS total_duration,
    AVG(
      CASE
        WHEN cdr_status = 'ANSWERED' THEN total_duration
        ELSE NULL
      END
    ) AS avg_duration
  `;
}

function resetCallSummarySchemaCache() {
  cachedColumns = null;
  cachedSchema = null;
}

/**
 * Build extension -> display name map for CDR rows (broader than normalizeExtensionCandidate-only lookup).
 */
async function buildAgentsNameMapForCdr(User, sequelize, agentValues) {
  const rawList = [
    ...new Set(
      (agentValues || [])
        .map((v) => (v != null ? String(v).trim() : ""))
        .filter(Boolean)
    ),
  ];

  if (!rawList.length || !User) return {};

  const intExts = rawList
    .map((e) => parseInt(e, 10))
    .filter((n) => !Number.isNaN(n));

  const orConditions = [];
  if (intExts.length) {
    orConditions.push({ extension: { [Op.in]: intExts } });
  }

  let agents = [];
  if (orConditions.length) {
    agents = await User.findAll({
      where: { [Op.or]: orConditions },
      attributes: ["extension", "full_name", "username"],
      raw: true,
    });
  }

  if (sequelize && rawList.length) {
    const byChar = await sequelize.query(
      `
      SELECT extension, full_name, username
      FROM Users
      WHERE CAST(extension AS CHAR) COLLATE utf8mb4_unicode_ci IN (:rawList)
      `,
      {
        replacements: { rawList },
        type: sequelize.QueryTypes.SELECT,
      }
    );
    agents = agents.concat(byChar);
  }

  const map = {};
  for (const a of agents) {
    if (a.extension == null) continue;
    const name = a.full_name || a.username || null;
    if (!name) continue;
    const key = String(a.extension);
    map[key] = name;
    const padded = key.padStart(4, "0");
    if (padded !== key) map[padded] = name;
    const asInt = parseInt(key, 10);
    if (!Number.isNaN(asInt)) map[String(asInt)] = name;
  }

  for (const raw of rawList) {
    if (map[raw]) continue;
    const digits = raw.replace(/\D/g, "");
    if (digits && map[digits]) map[raw] = map[digits];
  }

  return map;
}

function resolveAgentNameFromMap(agentExtension, agentsMap) {
  if (!agentExtension) return null;
  const raw = String(agentExtension).trim();
  const digits = raw.replace(/\D/g, "");
  return (
    agentsMap[raw] ||
    (digits && agentsMap[digits]) ||
    (digits && agentsMap[digits.padStart(4, "0")]) ||
    null
  );
}

/**
 * Fill agent_name when SQL join did not resolve (fallback).
 * @param {Array<object>} rows - rows after mapRowsToCdrApiShape
 * @param {import('sequelize').Model|null} User - Users model
 * @param {import('sequelize').Sequelize|null} sequelize
 * @returns {Promise<Array<object>>}
 */
async function enrichCdrRowsWithAgentNames(rows, User, sequelize) {
  if (!rows?.length || !User) return rows || [];

  const missing = rows.filter(
    (row) => !row.agent_name && pickAgentExtensionForRow(row)
  );

  if (!missing.length) return rows;

  const agentsMap = await buildAgentsNameMapForCdr(
    User,
    sequelize,
    missing.map((row) => pickAgentExtensionForRow(row))
  );

  let resolved = 0;
  const enriched = rows.map((row) => {
    if (row.agent_name) {
      const ext = pickAgentExtensionForRow(row);
      return ext ? { ...row, agent_extension: ext } : row;
    }

    const agent_extension = pickAgentExtensionForRow(row);
    if (!agent_extension) {
      return { ...row, agent_extension: null, agent_name: null };
    }

    const agent_name = resolveAgentNameFromMap(agent_extension, agentsMap);
    if (agent_name) resolved += 1;

    return { ...row, agent_extension, agent_name: agent_name || null };
  });

  if (process.env.NODE_ENV === "development" && missing.length) {
    console.debug(
      `[callSummaryReportHelper] agent_name fallback resolved ${resolved}/${missing.length} rows`
    );
  }

  return enriched;
}

function buildAgentPerformanceFromClause(alias = "cs", options = {}) {
  const a = alias;
  return `
    FROM ${VIEW_NAME} ${a}
    LEFT JOIN Users u_agent
      ON ${a}.agent IS NOT NULL
      AND TRIM(${a}.agent) <> ''
      AND (
        u_agent.extension = CAST(${a}.agent AS UNSIGNED)
        OR CAST(u_agent.extension AS CHAR) COLLATE utf8mb4_unicode_ci
          = TRIM(${a}.agent) COLLATE utf8mb4_unicode_ci
        OR u_agent.username = TRIM(${a}.agent)
      )
    LEFT JOIN Users u_dst
      ON (${a}.agent IS NULL OR TRIM(${a}.agent) = '')
      AND ${a}.called IS NOT NULL
      AND TRIM(${a}.called) REGEXP '^[0-9]{3,6}$'
      AND TRIM(${a}.called) NOT REGEXP '^0+$'
      AND (
        u_dst.extension = CAST(TRIM(${a}.called) AS UNSIGNED)
        OR CAST(u_dst.extension AS CHAR) COLLATE utf8mb4_unicode_ci
          = TRIM(${a}.called) COLLATE utf8mb4_unicode_ci
      )${buildCdrQueueWaitJoin(a, options)}`;
}

function buildAgentPerformanceAggregateSelect(alias = "cs") {
  const a = alias;
  const schema = getSchema();
  const durationCol = qualify(a, schema.durationColumn || "total_duration");
  const agentWaitExpr = buildCdrAgentWaitSelect().replace(/\s+AS agent_wait_sec\s*$/, "");
  const answeredExpr = `(LOWER(${a}.status) = 'answered' OR ${a}.cdr_status = 'ANSWERED')`;

  return `
    COALESCE(u_agent.id, u_dst.id) AS agent_id,
    COALESCE(u_agent.full_name, u_dst.full_name) AS agent_name,
    COUNT(*) AS total_calls,
    SUM(CASE WHEN ${answeredExpr} THEN 1 ELSE 0 END) AS answered_calls,
    SUM(
      CASE
        WHEN LOWER(${a}.status) IN ('lost', 'dropped') THEN 1
        WHEN ${a}.cdr_status IS NOT NULL AND ${a}.cdr_status != 'ANSWERED' AND NOT (${answeredExpr}) THEN 1
        ELSE 0
      END
    ) AS missed_calls,
    AVG(CASE WHEN ${answeredExpr} THEN ${durationCol} END) AS avg_duration,
    SUM(
      CASE
        WHEN ${answeredExpr} THEN
          CASE
            WHEN (${agentWaitExpr}) IS NOT NULL
              THEN GREATEST(0, COALESCE(${durationCol}, 0) - (${agentWaitExpr}))
            ELSE 0
          END
        ELSE 0
      END
    ) AS total_talk_time
  `;
}

/**
 * Aggregate agent performance metrics from call_summary for a date range.
 * @param {import('sequelize').Sequelize} sequelize
 * @param {{ startDate: string, endDate: string, agentUserId?: number|string|null }} options
 * @returns {Promise<Array<object>>}
 */
async function queryAgentPerformanceAggregates(
  sequelize,
  { startDate, endDate, agentUserId = null }
) {
  await ensureCallSummaryReady(sequelize);

  const dateFilter = buildDateRangeWhere("cs", startDate, endDate);
  const destFilter = buildCdrDestinationWhere("cs", "called");
  const queueWaitOpts = { queueLogDateFilter: true };

  const whereParts = [
    dateFilter.sql,
    destFilter.sql,
    "COALESCE(u_agent.id, u_dst.id) IS NOT NULL",
  ];

  const replacements = {
    ...dateFilter.replacements,
    ...destFilter.replacements,
    ...buildCdrQueueWaitReplacements(startDate, endDate),
  };

  if (agentUserId != null && agentUserId !== "" && agentUserId !== "all") {
    whereParts.push("COALESCE(u_agent.id, u_dst.id) = :agentUserId");
    replacements.agentUserId = agentUserId;
  }

  const rows = await sequelize.query(
    `
    SELECT ${buildAgentPerformanceAggregateSelect("cs")}
    ${buildAgentPerformanceFromClause("cs", queueWaitOpts)}
    WHERE ${whereParts.join(" AND ")}
    GROUP BY COALESCE(u_agent.id, u_dst.id), COALESCE(u_agent.full_name, u_dst.full_name)
    ORDER BY agent_name ASC
    `,
    {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    }
  );

  return (rows || []).map((row) => {
    const totalCalls = Number(row.total_calls) || 0;
    const answeredCalls = Number(row.answered_calls) || 0;
    const missedCalls =
      Number(row.missed_calls) ||
      Math.max(0, totalCalls - answeredCalls);
    const avgDuration = row.avg_duration != null ? Math.round(Number(row.avg_duration)) : 0;
    const totalTalkTime = Number(row.total_talk_time) || 0;
    const fcrRate =
      totalCalls > 0
        ? `${Math.round((answeredCalls / totalCalls) * 100)}%`
        : "0%";

    return {
      id: row.agent_id,
      agent_id: row.agent_id,
      agent_name: row.agent_name || "Unknown Agent",
      total_calls: totalCalls,
      answered_calls: answeredCalls,
      missed_calls: missedCalls,
      avg_duration: avgDuration,
      total_talk_time: totalTalkTime,
      fcr_rate: fcrRate,
    };
  });
}

module.exports = {
  VIEW_NAME,
  loadCallSummaryColumns,
  ensureCallSummaryReady,
  getSchema,
  buildDateRangeWhere,
  buildDateRangeWhereBound,
  buildDispositionWhere,
  normalizeCallStatus,
  normalizeDispositionFilter,
  buildCdrDestinationWhere,
  buildCdrQueueWaitReplacements,
  buildCdrReportFromClause,
  buildCdrQueueWaitJoin,
  buildCdrAgentWaitSelect,
  buildCdrReportSelectList,
  pickAgentExtensionForRow,
  mapRowToCdrApiShape,
  mapRowsToCdrApiShape,
  enrichCdrRowsWithAgentNames,
  buildSlaAggregateSelect,
  buildCallSummaryAggregateSelect,
  buildAgentPerformanceFromClause,
  buildAgentPerformanceAggregateSelect,
  queryAgentPerformanceAggregates,
  resetCallSummarySchemaCache,
};
