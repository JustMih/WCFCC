"use strict";

const { Op } = require("sequelize");

/** Valid agent extension: 3–6 digits, not all zeros */
function normalizeExtensionCandidate(raw) {
  if (raw == null || raw === "") return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length < 3 || digits.length > 6) return null;
  if (/^0+$/.test(digits)) return null;
  return digits;
}

/** PJSIP/1005-xxxxx or SIP/1005-… — not arbitrary long numeric IDs */
function extractExtensionFromChannel(channel) {
  if (!channel) return null;
  const s = String(channel);
  const patterns = [
    /PJSIP\/(\d{3,6})-/i,
    /(?:SIP|Local|IAX2)\/(\d{3,6})-/i,
    /PJSIP\/(\d{3,6})@/i,
    /\/(\d{3,6})-/,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) return normalizeExtensionCandidate(m[1]);
  }
  return null;
}

function extractExtensionFromQueueAgent(agent) {
  if (!agent) return null;
  return (
    extractExtensionFromChannel(agent) ||
    normalizeExtensionCandidate(agent)
  );
}

/**
 * Load Users by extension (DB column may be INTEGER).
 * Returns map keyed by string extension, e.g. { "1005": "Jane Doe" }.
 */
async function buildAgentsNameMap(User, extensionCandidates) {
  const normalized = [
    ...new Set(
      (extensionCandidates || [])
        .map(normalizeExtensionCandidate)
        .filter(Boolean)
    ),
  ];

  if (normalized.length === 0) return {};

  const intExts = normalized
    .map((e) => parseInt(e, 10))
    .filter((n) => !Number.isNaN(n));

  const agents = await User.findAll({
    where: { extension: { [Op.in]: intExts } },
    attributes: ["extension", "full_name", "username"],
    raw: true,
  });

  const map = {};
  for (const a of agents) {
    const name =
      a.full_name || a.username || `Agent ${a.extension}`;
    const key = String(a.extension);
    map[key] = name;
    const padded = key.padStart(4, "0");
    if (padded !== key) map[padded] = name;
  }
  return map;
}

function resolveAgentForCall(call, agentsMap) {
  const candidates = [
    call.agent_extension,
    extractExtensionFromChannel(call.agent_channel),
    extractExtensionFromChannel(call.channel),
    normalizeExtensionCandidate(call.caller),
  ].filter(Boolean);

  for (const ext of candidates) {
    if (agentsMap[ext]) {
      return { agent_extension: ext, agent_name: agentsMap[ext] };
    }
  }

  const ext = normalizeExtensionCandidate(call.agent_extension);
  if (ext) {
    return {
      agent_extension: ext,
      agent_name: agentsMap[ext] || "Unknown Agent",
    };
  }

  return {
    agent_extension: call.agent_extension || null,
    agent_name: call.agent_extension ? "Unknown Agent" : "Unassigned",
  };
}

module.exports = {
  normalizeExtensionCandidate,
  extractExtensionFromChannel,
  extractExtensionFromQueueAgent,
  buildAgentsNameMap,
  resolveAgentForCall,
};
