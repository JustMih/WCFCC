/**
 * One row per call session (linkedid / uniqueid) from raw Asterisk CDR.
 * Queue retries create many CDR legs; total wait = SUM(duration) on queue NO ANSWER legs.
 */
const { QueryTypes } = require("sequelize");
const { getCdrSessionIdExpr } = require("./cdrSchemaHelper");
const { extractExtensionFromChannel } = require("./agentExtensionHelper");

const {
  LOST_MIN_DURATION_SECONDS,
  normalizeQueueWaitSeconds,
  queueWaitToMinutes,
} = require("./queueTimingConstants");

function deriveSessionStatus(row) {
  if (Number(row.has_agent_answer) > 0) return "answered";
  const wait = normalizeQueueWaitSeconds(
    Math.max(Number(row.queue_wait_sec) || 0, Number(row.total_duration) || 0)
  );
  if (wait >= LOST_MIN_DURATION_SECONDS) return "lost";
  if (wait > 0) return "dropped";
  return "dropped";
}

/**
 * CDR report rows: one per call, duration = sum of all legs for that session.
 */
async function queryCdrSessionsForReport(
  sequelize,
  { startDate, endDate, disposition = "all", excludeDestS = false }
) {
  const sessionExpr = await getCdrSessionIdExpr(sequelize, "c");
  const destSql = excludeDestS
    ? "AND (c.dst IS NULL OR TRIM(UPPER(c.dst)) NOT IN ('S', 'I', 'T'))"
    : "";

  const statusFilter = String(disposition || "all").trim().toLowerCase();
  const wantStatus =
    statusFilter === "answered" ||
    statusFilter === "lost" ||
    statusFilter === "dropped"
      ? statusFilter
      : null;

  const rows = await sequelize.query(
    `
    SELECT
      ${sessionExpr} AS uniqueid,
      MIN(c.cdrstarttime) AS call_start,
      MAX(COALESCE(c.cdrendtime, c.cdrstarttime)) AS call_end,
      MIN(
        COALESCE(
          NULLIF(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(c.clid, '<', -1), '>', 1)), ''),
          NULLIF(TRIM(c.src), ''),
          NULLIF(TRIM(c.clid), '')
        )
      ) AS caller,
      SUBSTRING_INDEX(
        GROUP_CONCAT(
          NULLIF(TRIM(c.dst), '') ORDER BY c.cdrstarttime DESC SEPARATOR '||'
        ),
        '||',
        1
      ) AS called,
      SUM(COALESCE(c.duration, 0)) AS total_duration,
      MAX(COALESCE(c.billsec, 0)) AS billsec,
      MAX(
        CASE
          WHEN c.disposition = 'ANSWERED'
            AND (
              c.dstchannel LIKE 'PJSIP/%'
              OR c.dstchannel LIKE 'SIP/%'
            )
          THEN 1
          ELSE 0
        END
      ) AS has_agent_answer,
      SUM(
        CASE
          WHEN c.lastapp IN ('Queue', 'AppQueue')
          THEN COALESCE(c.duration, 0)
          ELSE 0
        END
      ) AS queue_wait_sec,
      SUBSTRING_INDEX(
        GROUP_CONCAT(
          CASE
            WHEN c.disposition = 'ANSWERED'
              AND (
                c.dstchannel LIKE 'PJSIP/%'
                OR c.dstchannel LIKE 'SIP/%'
              )
            THEN NULLIF(TRIM(c.dstchannel), '')
            ELSE NULL
          END
          ORDER BY c.cdrstarttime DESC SEPARATOR '||'
        ),
        '||',
        1
      ) AS agent_dstchannel,
      SUBSTRING_INDEX(
        GROUP_CONCAT(
          NULLIF(TRIM(c.disposition), '') ORDER BY c.cdrstarttime DESC SEPARATOR '||'
        ),
        '||',
        1
      ) AS cdr_status,
      SUBSTRING_INDEX(
        GROUP_CONCAT(
          CASE
            WHEN c.lastdata IS NOT NULL AND TRIM(c.lastdata) <> ''
            THEN SUBSTRING_INDEX(TRIM(c.lastdata), ',', 1)
            ELSE NULL
          END
          ORDER BY c.cdrstarttime DESC SEPARATOR '||'
        ),
        '||',
        1
      ) AS queue
    FROM cdr c
    WHERE c.cdrstarttime >= CONCAT(:startDate, ' 00:00:00')
      AND c.cdrstarttime < DATE_ADD(CONCAT(:endDate, ' 00:00:00'), INTERVAL 1 DAY)
      ${destSql}
    GROUP BY ${sessionExpr}
    ORDER BY call_start DESC
    `,
    {
      replacements: { startDate, endDate },
      type: QueryTypes.SELECT,
    }
  );

  const mapped = rows.map((row) => {
    const status = deriveSessionStatus(row);
    const agent_extension =
      extractExtensionFromChannel(row.agent_dstchannel) || null;
    return {
      uniqueid: row.uniqueid,
      id: row.uniqueid,
      call_start: row.call_start,
      cdrstarttime: row.call_start,
      call_end: row.call_end,
      clid: row.caller,
      src: row.caller,
      dst: row.called,
      caller: row.caller,
      called: row.called,
      direction: "INBOUND",
      total_duration: Number(row.total_duration) || 0,
      duration: Number(row.total_duration) || 0,
      queue_wait_sec: normalizeQueueWaitSeconds(
        Math.max(Number(row.queue_wait_sec) || 0, Number(row.total_duration) || 0)
      ),
      billsec: Number(row.billsec) || 0,
      status,
      disposition: status,
      cdr_status: row.cdr_status || null,
      queue: row.queue || null,
      agent_extension,
      agent: agent_extension,
      agent_dstchannel: row.agent_dstchannel || null,
      has_agent_answer: Number(row.has_agent_answer) || 0,
      recordingfile: null,
    };
  });

  if (!wantStatus) return mapped;
  return mapped.filter((r) => r.status === wantStatus);
}

module.exports = {
  LOST_MIN_DURATION_SECONDS,
  deriveSessionStatus,
  queryCdrSessionsForReport,
  queueWaitToMinutes,
};
