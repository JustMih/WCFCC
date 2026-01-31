"use strict";

const { User } = require("../../models");
const { getLiveChannelByExtension } = require("../../services/liveCallResolver");

/**
 * Supported actions:
 *  - listen  → ChanSpy(PJSIP/XXXX,q)
 *  - whisper → ChanSpy(PJSIP/XXXX,qw)
 *  - barge   → ChanSpy(PJSIP/XXXX,qB)
 */
const ACTION_MAP = {
  listen: "q",
  whisper: "qw",
  barge: "qB",
};

exports.callControl = async (req, res) => {
  try {
    /* =====================================================
       1️⃣ INPUT VALIDATION (ONLY)
    ===================================================== */
    const { agentExtension, action } = req.body || {};

    if (!agentExtension || typeof agentExtension !== "string") {
      return res.status(400).json({ error: "agentExtension is required" });
    }

    if (!action || !ACTION_MAP[action]) {
      return res.status(400).json({ error: "Invalid action" });
    }

    const option = ACTION_MAP[action];

    /* =====================================================
       2️⃣ AGENT LOOKUP (OPTIONAL BUT SAFE)
    ===================================================== */
    const agent = await User.findOne({
      where: {
        extension: agentExtension,
        role: "agent",
      },
      attributes: ["id", "full_name", "extension"],
    });

    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    /* =====================================================
       3️⃣ LIVE CHANNEL RESOLUTION
    ===================================================== */
    const channel = await getLiveChannelByExtension(agentExtension);

    if (!channel) {
      return res
        .status(409)
        .json({ error: "Agent is not on an active call" });
    }

    /* =====================================================
       4️⃣ BUILD DIAL STRING
    ===================================================== */
    const dial = `ChanSpy(${channel},${option})`;

    /* =====================================================
       5️⃣ LOG (DEBUG)
    ===================================================== */
    console.log("🎧 SPY TEST MODE");
    console.log(" Agent   :", agent.full_name, `(Ext ${agent.extension})`);
    console.log(" Channel :", channel);
    console.log(" Action  :", action);
    console.log(" Dial    :", dial);

    /* =====================================================
       6️⃣ RESPONSE
    ===================================================== */
    return res.json({
      success: true,
      dial,
      meta: {
        agent: agent.full_name,
        extension: agent.extension,
        action,
      },
    });

  } catch (err) {
    console.error("❌ Spy controller error:", err);
    return res.status(500).json({
      success: false,
      error: "Spy operation failed",
    });
  }
};
