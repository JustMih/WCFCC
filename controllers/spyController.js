"use strict";

const {
  supervisorSpyOnLinkedCall,
} = require("../services/supervisorCallControl");
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

module.exports = { spyOnCall };
