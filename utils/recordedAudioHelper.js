"use strict";

const { Op } = require("sequelize");
const {
  normalizeExtensionCandidate,
  extractExtensionFromChannel,
} = require("./agentExtensionHelper");

/** Minimum talk time (seconds) after agent answer */
const MIN_AGENT_BILLSEC = 3;

const AGENT_ROLES = ["agent", "supervisor"];

const IVR_LAST_APPS = new Set([
  "Playback",
  "BackGround",
  "WaitExten",
  "Read",
  "Goto",
  "GotoIf",
]);

/**
 * Simple CDR query — avoids fragile JOINs/subqueries on production MySQL.
 * Agent matching is done in Node using Users.extension.
 */
function buildAgentRecordedCallsQuery({ startDate, endDate, limit = 500 } = {}) {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 500, 1), 2000);

  let sql = `
    SELECT
      c.id,
      c.cdrstarttime,
      c.src AS caller,
      c.dst,
      c.dstchannel,
      c.billsec,
      c.disposition,
      c.lastapp,
      c.recordingfile AS filename
    FROM cdr c
    WHERE c.recordingfile IS NOT NULL
      AND c.recordingfile != ''
      AND c.disposition = 'ANSWERED'
      AND COALESCE(c.billsec, 0) >= :minBillsec
      AND c.dstchannel LIKE 'PJSIP/%'
  `;

  const replacements = { minBillsec: MIN_AGENT_BILLSEC };

  if (startDate) {
    sql += ` AND c.cdrstarttime >= CONCAT(:startDate, ' 00:00:00')`;
    replacements.startDate = startDate;
  }
  if (endDate) {
    sql += ` AND c.cdrstarttime <= CONCAT(:endDate, ' 23:59:59')`;
    replacements.endDate = endDate;
  }

  sql += ` ORDER BY c.cdrstarttime DESC LIMIT ${safeLimit}`;

  return { sql, replacements };
}

async function buildAllAgentsNameMap(User) {
  const agents = await User.findAll({
    where: {
      role: { [Op.in]: AGENT_ROLES },
      extension: { [Op.ne]: null },
    },
    attributes: ["extension", "full_name"],
    raw: true,
  });

  const map = {};
  for (const a of agents) {
    if (a.extension == null) continue;
    const key = String(a.extension);
    map[key] = a.full_name || `Agent ${key}`;
    const padded = key.padStart(4, "0");
    if (padded !== key && !map[padded]) map[padded] = map[key];
  }
  return map;
}

function resolveAgentExtensionFromCdr(row) {
  return (
    extractExtensionFromChannel(row.dstchannel) ||
    normalizeExtensionCandidate(row.dst)
  );
}

function filterAndEnrichAgentRecordings(rows, agentsMap) {
  if (!Array.isArray(rows)) return [];

  return rows
    .filter((row) => {
      if (!row.filename) return false;
      if (row.lastapp && IVR_LAST_APPS.has(row.lastapp)) return false;

      const ext = resolveAgentExtensionFromCdr(row);
      if (!ext || !agentsMap[ext]) return false;

      return true;
    })
    .map((row) => {
      const ext = resolveAgentExtensionFromCdr(row);
      return {
        id: row.id,
        cdrstarttime: row.cdrstarttime,
        caller: row.caller,
        agent_extension: ext,
        dstchannel: row.dstchannel,
        billsec: row.billsec,
        disposition: row.disposition,
        filename: row.filename,
        agent_name: agentsMap[ext] || `Agent ${ext}`,
      };
    });
}

module.exports = {
  MIN_AGENT_BILLSEC,
  buildAgentRecordedCallsQuery,
  buildAllAgentsNameMap,
  filterAndEnrichAgentRecordings,
};
