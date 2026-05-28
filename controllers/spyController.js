"use strict";

const {
  supervisorSpyOnLinkedCall,
} = require("../services/supervisorCallControl");
const { getAmiStatus } = require("../services/amiService");
const {
  refreshLiveCallsCacheIfStale,
} = require("./livestream/livestreamController");
const {
  notifyAgentSupervisorIntervention,
} = require("../services/supervisorSpyNotify");

const spyOnCall = async (req, res) => {
  try {
    const { linkedid, mode } = req.body || {};

    await refreshLiveCallsCacheIfStale();
    const getLiveCalls = req.app.locals.getLiveCalls;

    const result = await supervisorSpyOnLinkedCall({
      userId: req.user?.userId,
      linkedid,
      mode: mode || "listen",
      supervisorExtension: req.body?.supervisorExtension,
      getLiveCalls,
    });

    console.log(
      `🎧 Spy ${result.mode}: sup ${result.supervisor_extension} → ${result.spy_channel} (${linkedid})`
    );

    const supervisorName =
      req.user?.full_name || req.user?.username || req.user?.name;
    await notifyAgentSupervisorIntervention({
      agentExtension: result.agent_extension,
      mode: result.mode,
      supervisorUserId: req.user?.userId,
      supervisorExtension: result.supervisor_extension,
      supervisorName,
      linkedid,
    }).catch((err) =>
      console.warn("Agent intervention notify failed:", err.message)
    );

    return res.json(result);
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) {
      console.error("❌ Spy error:", err);
    }
    return res.status(status).json({
      error: err.message || "Spy failed",
      asterisk_state: err.asterisk_state,
      endpoint_line: err.endpoint_line,
    });
  }
};

const getSpyStatus = (req, res) => {
  const status = getAmiStatus();
  return res.json({
    ...status,
    hint: status.configured
      ? "AMI credentials are set; spy should work if Asterisk manager allows Originate + ChanSpy."
      : "Set AMI_PASS (and AMI_HOST if needed) in the server .env, then restart the API.",
  });
};

module.exports = { spyOnCall, getSpyStatus };
