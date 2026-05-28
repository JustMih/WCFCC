"use strict";

const {
  supervisorSpyOnLinkedCall,
} = require("../services/supervisorCallControl");
const { getAmiStatus } = require("../services/amiService");
const {
  refreshLiveCallsCacheIfStale,
} = require("./livestream/livestreamController");

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

    return res.json(result);
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) {
      console.error("❌ Spy error:", err);
    }
    return res.status(status).json({
      error: err.message || "Spy failed",
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
