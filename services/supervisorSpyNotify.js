"use strict";

const User = require("../models/User");

const MODE_LABELS = {
  listen: "listening to your call",
  whisper: "whispering on your call (customer cannot hear)",
  barge: "barged into your call",
};

async function findSupervisorDisplayName(userId) {
  if (!userId) return "Supervisor";
  try {
    const user = await User.findByPk(userId, {
      attributes: ["full_name", "username", "extension"],
    });
    if (!user) return "Supervisor";
    return user.full_name || user.username || `Supervisor ${user.extension || ""}`.trim();
  } catch {
    return "Supervisor";
  }
}

/**
 * Notify agent dashboard via Socket.IO when supervisor starts listen/whisper/barge.
 */
async function notifyAgentSupervisorIntervention({
  agentExtension,
  mode,
  supervisorUserId,
  supervisorExtension,
  supervisorName,
  linkedid,
}) {
  const io = global._io || global._ioHttps;
  if (!io || !agentExtension) return;

  const supName =
    supervisorName || (await findSupervisorDisplayName(supervisorUserId));
  const modeKey = String(mode || "listen").toLowerCase();
  const actionText = MODE_LABELS[modeKey] || MODE_LABELS.listen;

  const payload = {
    type: "supervisor_intervention",
    mode: modeKey,
    agent_extension: String(agentExtension),
    supervisor_extension: String(supervisorExtension || ""),
    supervisor_name: supName,
    linkedid: linkedid || null,
    message: `${supName} (ext ${supervisorExtension || "—"}) is ${actionText}.`,
    at: new Date().toISOString(),
  };

  io.emit("supervisor_intervention", payload);
  console.log(
    `📢 Supervisor intervention → agent ext ${agentExtension}: ${modeKey} by ${supName}`
  );
}

module.exports = {
  notifyAgentSupervisorIntervention,
  MODE_LABELS,
};
