"use strict";

const AmiClient = require("asterisk-manager");

const ami = new AmiClient(
  5038,
  process.env.ASTERISK_HOST,
  process.env.AMI_USER,
  process.env.AMI_PASS,
  true
);

/* ====================== MODE NORMALIZER ====================== */
const normalizeSpyMode = (mode) => {
  switch (mode) {
    case "listen":
      return "q";
    case "whisper":
      return "qw";
    case "barge":
      return "qb";
    default:
      return "q";
  }
};

/* ====================== SPY ACTION ====================== */
const spyOnCall = async (req, res) => {
  try {
    const { linkedid, mode } = req.body;

    // 🔒 1. Permission check
    if (!req.user || !req.user.is_supervisor) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // 🔍 2. Get live calls (reuse SAME logic)
    const liveCalls = await req.app.locals.getLiveCalls(); 
    const call = liveCalls.find(
      (c) => c.linkedid === linkedid && c.status === "active"
    );

    if (!call || !call.spyCallId) {
      return res.status(400).json({ error: "Call not spyiable" });
    }

    // 🎧 3. Normalize spy mode
    const spyMode = normalizeSpyMode(mode);

    // 📞 4. Originate WebRTC supervisor call
    ami.action({
      action: "Originate",
      channel: `PJSIP/${req.user.extension}`, // supervisor SIP.js endpoint
      context: "chanspy",
      exten: "chanspy",
      priority: 1,
      async: true,
      variable: {
        SIPADDHEADER:
          `X-Spy-Channel: ${call.spyCallId}\r\n` +
          `X-Spy-Mode: ${spyMode}`,
      },
    });

    return res.json({
      status: "ok",
      spying_on: call.agent_extension,
      mode,
    });
  } catch (err) {
    console.error("❌ Spy error:", err);
    return res.status(500).json({ error: "Spy failed" });
  }
};

module.exports = { spyOnCall };
