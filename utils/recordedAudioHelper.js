"use strict";

/** Minimum talk time (seconds) after agent answer — excludes IVR blips and ring-only legs */
const MIN_AGENT_BILLSEC = 3;

const AGENT_ROLES = ["agent", "supervisor"];

const IVR_LAST_APPS = ["Playback", "BackGround", "WaitExten", "Read", "Goto", "GotoIf"];

/**
 * SQL fragment: CDR leg is an inbound call answered on a registered agent extension.
 * Matches patterns used in getAgentCdrStats (dstchannel PJSIP/ext-…).
 */
function agentAnsweredRecordingWhereSql() {
  const roleList = AGENT_ROLES.map((r) => `'${r}'`).join(", ");
  const ivrApps = IVR_LAST_APPS.map((a) => `'${a}'`).join(", ");

  return `
    c.recordingfile IS NOT NULL
    AND TRIM(c.recordingfile) <> ''
    AND c.disposition = 'ANSWERED'
    AND COALESCE(c.billsec, 0) >= :minBillsec
    AND c.dstchannel LIKE 'PJSIP/%'
    AND (c.lastapp IS NULL OR c.lastapp NOT IN (${ivrApps}))
    AND EXISTS (
      SELECT 1 FROM Users u
      WHERE u.extension IS NOT NULL
        AND u.role IN (${roleList})
        AND (
          c.dstchannel LIKE CONCAT('PJSIP/', u.extension, '-%')
          OR c.dstchannel LIKE CONCAT('PJSIP/', LPAD(CAST(u.extension AS CHAR), 4, '0'), '-%')
          OR CAST(c.dst AS UNSIGNED) = u.extension
        )
    )
  `;
}

function buildAgentRecordedCallsQuery({ startDate, endDate, limit = 500 } = {}) {
  let sql = `
    SELECT
      c.id,
      c.cdrstarttime,
      c.src AS caller,
      c.dst AS agent_extension,
      c.dstchannel,
      c.billsec,
      c.disposition,
      c.recordingfile AS filename,
      (
        SELECT COALESCE(u.full_name, u.username, CONCAT('Agent ', u.extension))
        FROM Users u
        WHERE u.extension IS NOT NULL
          AND u.role IN ('agent', 'supervisor')
          AND (
            c.dstchannel LIKE CONCAT('PJSIP/', u.extension, '-%')
            OR c.dstchannel LIKE CONCAT('PJSIP/', LPAD(CAST(u.extension AS CHAR), 4, '0'), '-%')
            OR CAST(c.dst AS UNSIGNED) = u.extension
          )
        ORDER BY u.extension
        LIMIT 1
      ) AS agent_name
    FROM cdr c
    WHERE ${agentAnsweredRecordingWhereSql()}
  `;

  const replacements = { minBillsec: MIN_AGENT_BILLSEC, limit };

  if (startDate) {
    sql += ` AND c.cdrstarttime >= CONCAT(:startDate, ' 00:00:00')`;
    replacements.startDate = startDate;
  }
  if (endDate) {
    sql += ` AND c.cdrstarttime <= CONCAT(:endDate, ' 23:59:59')`;
    replacements.endDate = endDate;
  }

  sql += ` ORDER BY c.cdrstarttime DESC LIMIT :limit`;

  return { sql, replacements };
}

module.exports = {
  MIN_AGENT_BILLSEC,
  buildAgentRecordedCallsQuery,
};
