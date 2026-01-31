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

/* ====================== SPY ACTION (NO AUTH) ====================== */
const spyOnCall = async (req, res) => {
  try {
    console.log("🧪 TEST SPY REQUEST BODY:", req.body);

    const { linkedid, mode } = req.body;

    if (!linkedid || !mode) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    /* 🔍 GET LIVE CALLS */
    if (typeof req.app.locals.getLiveCalls !== "function") {
      return res.status(500).json({ error: "Live call cache not available" });
    }

    const liveCalls = await req.app.locals.getLiveCalls();

    const call = liveCalls.find(
      (c) => c.linkedid === linkedid && c.status === "active"
    );

    if (!call || !call.spyCallId) {
      return res.status(400).json({ error: "Call not spyiable" });
    }

    /* 🎧 NORMALIZE MODE */
    const spyMode = normalizeSpyMode(mode);

    /* ⚠️ TEMP: HARD-CODE SUPERVISOR EXTENSION FOR TESTING */
    const supervisorExtension = "9000"; // 🔴 CHANGE IF NEEDED

    console.log("📞 Spying on:", call.spyCallId, "mode:", spyMode);

    /* 📞 ORIGINATE SUPERVISOR CALL */
    ami.action({
      action: "Originate",
      channel: `PJSIP/${supervisorExtension}`,
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
      test: true,
    });
  } catch (err) {
    console.error("❌ Spy error:", err);
    return res.status(500).json({ error: "Spy failed" });
  }
};

module.exports = { spyOnCall };
