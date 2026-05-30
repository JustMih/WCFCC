"use strict";

const { Op } = require("sequelize");
const {
  normalizeExtensionCandidate,
  extractExtensionFromChannel,
} = require("./agentExtensionHelper");
const { resolveRecordedCallFilePath } = require("./recordedCallAudio");

const AGENT_ROLES = ["agent", "supervisor"];

/**
 * Original-style listing: all answered CDR rows with a recording file.
 * Agent extension/name are added when we can detect them (no row dropped).
 */
function buildAgentRecordedCallsQuery({ startDate, endDate, limit = 500 } = {}) {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 500, 1), 2000);

  let sql = `
    SELECT
      c.id,
      c.cdrstarttime,
      c.src AS caller,
      c.dst,
      c.dcontext,
      c.channel,
      c.dstchannel,
      c.duration,
      c.billsec,
      c.disposition,
      c.lastapp,
      c.uniqueid,
      c.recordingfile AS filename
    FROM cdr c
    WHERE c.recordingfile IS NOT NULL
      AND TRIM(c.recordingfile) != ''
      AND c.disposition = 'ANSWERED'
  `;

  const replacements = {};

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

/** Best-effort agent extension (inbound, internal, outbound, emergency-dial). */
function resolveAgentExtensionFromCdr(row, agentsMap) {
  const candidates = [
    extractExtensionFromChannel(row.dstchannel),
    extractExtensionFromChannel(row.channel),
    normalizeExtensionCandidate(row.dst),
    normalizeExtensionCandidate(row.src),
  ].filter(Boolean);

  for (const ext of candidates) {
    if (!agentsMap || agentsMap[ext]) return ext;
  }

  return candidates[0] || null;
}

function dedupeByRecordingFile(rows) {
  const byFile = new Map();
  for (const row of rows) {
    const key = String(row.filename || "").trim();
    if (!key) continue;
    const prev = byFile.get(key);
    const score = (r) =>
      (Number(r.billsec) || 0) * 10 + (Number(r.duration) || 0);
    if (!prev || score(row) > score(prev)) {
      byFile.set(key, row);
    }
  }
  return [...byFile.values()];
}

function filterAndEnrichAgentRecordings(rows, agentsMap) {
  if (!Array.isArray(rows)) return [];

  const deduped = dedupeByRecordingFile(rows.filter((row) => row.filename));

  return deduped.map((row) => {
    const ext = resolveAgentExtensionFromCdr(row, agentsMap);
    const talkSeconds = Math.max(
      Number(row.billsec) || 0,
      Number(row.duration) || 0
    );
    const diskPath = resolveRecordedCallFilePath(row.filename, row.uniqueid);

    return {
      id: row.id,
      cdrstarttime: row.cdrstarttime,
      caller: row.caller,
      dst: row.dst,
      dcontext: row.dcontext,
      agent_extension: ext,
      dstchannel: row.dstchannel,
      channel: row.channel,
      billsec: talkSeconds || row.billsec,
      disposition: row.disposition,
      filename: row.filename,
      uniqueid: row.uniqueid,
      agent_name: ext && agentsMap[ext] ? agentsMap[ext] : null,
      file_found: Boolean(diskPath),
    };
  });
}

module.exports = {
  buildAgentRecordedCallsQuery,
  buildAllAgentsNameMap,
  resolveAgentExtensionFromCdr,
  filterAndEnrichAgentRecordings,
};
