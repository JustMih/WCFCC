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

  // adjust ONLY if your role names differ
  return ["SUPERVISOR", "ADMIN"].includes(user.role);
};
console.log("👤 req.user:", req.user);

/* ====================== SPY ACTION ====================== */
const spyOnCall = async (req, res) => {
  try {
    const { linkedid, mode } = req.body;

    /* 🔐 1. AUTH CHECK */
    if (!req.user) {
      return res.status(401).json({ error: "Unauthenticated" });
    }

    if (!isAuthorizedSupervisor(req.user)) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    if (!linkedid || !mode) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    /* 🔍 2. GET LIVE CALLS */
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

    /* 🎧 3. NORMALIZE MODE */
    const spyMode = normalizeSpyMode(mode);

    /* 📞 4. ORIGINATE SUPERVISOR CALL */
    ami.action({
      action: "Originate",
      channel: `PJSIP/${req.user.extension}`, // supervisor WebRTC endpoint
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

    /* ✅ 5. RESPONSE */
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
