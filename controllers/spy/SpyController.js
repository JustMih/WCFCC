"use strict";

const {
  supervisorSpyOnAgent,
} = require("../../services/supervisorCallControl");

exports.callControl = async (req, res) => {
  try {
    const { agentExtension, action } = req.body || {};
    const getLiveCalls = req.app.locals.getLiveCalls;

    const result = await supervisorSpyOnAgent({
      userId: req.user?.userId,
      agentExtension,
      mode: action || "listen",
      supervisorExtension: req.body?.supervisorExtension,
      getLiveCalls,
    });

    return res.json(result);
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) {
      console.error("❌ Spy call-control error:", err);
    }
    return res.status(status).json({
      success: false,
      error: err.message || "Spy operation failed",
    });
  }
};
