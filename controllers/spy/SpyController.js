"use strict";

/**
 * Supervisor Call Control (ChanSpy)
 *
 * Supported actions:
 *  - listen  → ChanSpy(PJSIP/XXXX,q)
 *  - whisper → ChanSpy(PJSIP/XXXX,qw)
 *  - barge   → ChanSpy(PJSIP/XXXX,qB)
 *
 * Body:
 * {
 *   callId: "PJSIP/1001",
 *   action: "listen" | "whisper" | "barge"
 * }
 */
exports.callControl = async (req, res) => {
  try {
    const { callId, action } = req.body || {};

    /* ================= VALIDATION ================= */
    if (!callId || typeof callId !== "string") {
      return res.status(400).json({
        success: false,
        error: "Invalid or missing callId"
      });
    }

    if (!action || typeof action !== "string") {
      return res.status(400).json({
        success: false,
        error: "Invalid or missing action"
      });
    }

    /* ================= ACTION MAP ================= */
    const ACTION_MAP = {
      listen: "q",    // quiet listen
      whisper: "qw",  // whisper
      barge: "qB"     // barge
    };

    const option = ACTION_MAP[action];

    if (!option) {
      return res.status(400).json({
        success: false,
        error: "Unsupported action"
      });
    }

    /* ================= BUILD DIAL ================= */
    // IMPORTANT:
    // callId MUST be base channel, e.g. PJSIP/1001
    const dial = `ChanSpy(${callId},${option})`;

    /* ================= LOG ================= */
    console.log("🎧 SUPERVISOR SPY");
    console.log("   Action :", action);
    console.log("   Channel:", callId);
    console.log("   Dial   :", dial);

    /* ================= RESPONSE ================= */
    return res.status(200).json({
      success: true,
      dial
    });

  } catch (err) {
    console.error("❌ Spy controller error:", err);

    // ALWAYS JSON — never HTML
    return res.status(500).json({
      success: false,
      error: "Spy operation failed"
    });
  }
};
