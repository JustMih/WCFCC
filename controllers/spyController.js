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

/* ====================== ROLE CHECK ====================== */
const isAuthorizedSupervisor = (user) => {
  if (!user) return false;
  return ["SUPERVISOR", "ADMIN"].includes(user.role);
};

/* ====================== SPY ACTION ====================== */
const spyOnCall = async (req, res) => {
  try {
    console.log("👤 req.user:", req.user);

    const { linkedid, mode } = req.body;

    /* 🔐 AUTH CHECK */
    if (!req.user) {
      return res.status(401).json({ error: "Unauthenticated" });
    }

    if (!isAuthorizedSupervisor(req.user)) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    if (!req.user.extension) {
      return res.status(400).json({ error: "Supervisor extension missing" });
    }

    if (!linkedid || !mode) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    /* 🔍 GET LIVE CALL */
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

    /* 📞 ORIGINATE SUPERVISOR CALL */
    ami.action({
      action: "Originate",
      channel: `PJSIP/${req.user.extension}`,
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

    /* ✅ RESPONSE */
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
