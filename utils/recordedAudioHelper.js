"use strict";

const { Op } = require("sequelize");
const {
  normalizeExtensionCandidate,
  extractExtensionFromChannel,
} = require("./agentExtensionHelper");
const { resolveRecordedCallFilePath } = require("./recordedCallAudio");

/** Minimum talk time (seconds) — use billsec or duration (internal calls often billsec=0 on extra CDR leg) */
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

const AGENT_CALL_LAST_APPS = new Set(["Dial", "Queue", "AppQueue", "Macro"]);

/**
 * Simple CDR query — agent matching done in Node using Users.extension.
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
      AND (
        COALESCE(c.billsec, 0) >= :minBillsec
        OR COALESCE(c.duration, 0) >= :minBillsec
      )
      AND (
        c.channel LIKE 'PJSIP/%'
        OR c.dstchannel LIKE 'PJSIP/%'
      )
      AND (c.lastapp IS NULL OR c.lastapp NOT IN ('Playback', 'BackGround', 'WaitExten', 'Read', 'Goto', 'GotoIf'))
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

/**
 * Inbound: agent on dstchannel (PJSIP/1007-…).
 * Outbound / internal: agent on channel (PJSIP/1001-…), trunk on dstchannel (PJSIP/eGA-…).
 */
function resolveAgentExtensionFromCdr(row, agentsMap) {
  const candidates = [
    extractExtensionFromChannel(row.dstchannel),
    extractExtensionFromChannel(row.channel),
  ].filter(Boolean);

  for (const ext of candidates) {
    if (agentsMap[ext]) return ext;
  }

  const dstExt = normalizeExtensionCandidate(row.dst);
  if (dstExt && agentsMap[dstExt]) return dstExt;

  return candidates[0] || null;
}

function isAgentCallLeg(row) {
  if (row.lastapp && IVR_LAST_APPS.has(row.lastapp)) return false;
  if (row.dcontext === "inbound" && row.lastapp === "BackGround") return false;

  const ext = extractExtensionFromChannel(row.channel) ||
    extractExtensionFromChannel(row.dstchannel);
  if (!ext) return false;

  if (row.lastapp && AGENT_CALL_LAST_APPS.has(row.lastapp)) return true;
  if (row.dcontext === "internal") return true;

  return Boolean(row.channel && row.channel.includes(`PJSIP/${ext}`));
}

function dedupeByRecordingFile(rows) {
  const byFile = new Map();
  for (const row of rows) {
    const key = String(row.filename || "").trim();
    if (!key) continue;
    const prev = byFile.get(key);
    const score = (row) =>
      (Number(row.billsec) || 0) * 10 + (Number(row.duration) || 0);
    if (!prev || score(row) > score(prev)) {
      byFile.set(key, row);
    }
  }
  return [...byFile.values()];
}

function filterAndEnrichAgentRecordings(rows, agentsMap) {
  if (!Array.isArray(rows)) return [];

  const filtered = rows.filter((row) => {
    if (!row.filename) return false;
    if (!isAgentCallLeg(row)) return false;

    const ext = resolveAgentExtensionFromCdr(row, agentsMap);
    if (!ext || !agentsMap[ext]) return false;

    return true;
  });

  return dedupeByRecordingFile(filtered).map((row) => {
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
      billsec: talkSeconds,
      disposition: row.disposition,
      filename: row.filename,
      uniqueid: row.uniqueid,
      agent_name: agentsMap[ext] || `Agent ${ext}`,
      file_found: Boolean(diskPath),
      resolved_path: diskPath || null,
    };
  });
}

module.exports = {
  MIN_AGENT_BILLSEC,
  buildAgentRecordedCallsQuery,
  buildAllAgentsNameMap,
  filterAndEnrichAgentRecordings,
};
