"use strict";

/**
 * Supervisor Call Control (ChanSpy)
 *
 * Supported actions:
 *  - listen  → ChanSpy(PJSIP/XXXX,q)
 *  - whisper → ChanSpy(PJSIP/XXXX,qw)
 *  - barge   → ChanSpy(PJSIP/XXXX,qB)
 *
 * Expects:
 *  {
 *    callId: "PJSIP/1001",
 *    action: "listen" | "whisper" | "barge"
 *  }
 */
exports.callControl = async (req, res) => {
  try {
    const { callId, action } = req.body;

    /* ================= VALIDATION ================= */
    if (!callId || typeof callId !== "string") {
      return res.status(400).json({
        error: "Invalid or missing callId"
      });
    }

    if (!action || typeof action !== "string") {
      return res.status(400).json({
        error: "Invalid or missing action"
      });
    }

    /* ================= ACTION MAP ================= */
    const ACTION_MAP = {
      listen: "q",   // quiet listen
      whisper: "qw", // whisper to agent
      barge: "qB"    // barge-in
    };

    const option = ACTION_MAP[action];

    if (!option) {
      return res.status(400).json({
        error: "Unsupported action"
      });
    }

    /* ================= BUILD DIAL STRING ================= */
    // IMPORTANT:
    // callId MUST be agent channel base (e.g. PJSIP/1001)
    const dial = `ChanSpy(${callId},${option})`;

    /* ================= LOG ================= */
    console.log("🎧 SUPERVISOR SPY");
    console.log("   Action :", action);
    console.log("   Channel:", callId);
    console.log("   Dial   :", dial);

    /* ================= RESPONSE ================= */
    return res.json({
      success: true,
      action,
      dial
    });

  } catch (error) {
    console.error("❌ Spy controller error:", error);

    return res.status(500).json({
      success: false,
      error: "Spy operation failed"
    });
  }
};
