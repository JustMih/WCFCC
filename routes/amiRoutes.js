const express = require("express");
const { makeCall } = require("../controllers/ami/amiController");
const { authMiddleware } = require("../middleware/authMiddleware");
const {
  hangupAgentCallByExtension,
} = require("../services/hangupAgentCallService");
const router = express.Router();

// Route to make a call
router.post("/call", authMiddleware, async (req, res) => {
  const { channel, number } = req.body;

  // Validate the incoming request data
  if (!channel || !number) {
    return res.status(400).json({ error: "Missing channel or number" });
  }

  try {
    // Call the function to initiate the call
    const message = await makeCall(channel, number);

    // Respond with success message
    res.status(200).json({ message: message });
  } catch (error) {
    // Handle any error in the process of making the call
    res.status(500).json({ error: error.message });
  }
});

/**
 * Hang up the agent's live PJSIP channel(s) after browser refresh/close.
 * Used by keepalive fetch from useSipPhone so customer + wallboard don't stay ACTIVE.
 */
router.post("/hangup-agent-call", authMiddleware, async (req, res) => {
  try {
    const extension =
      req.body?.extension ||
      req.query?.extension ||
      null;

    if (!extension) {
      return res.status(400).json({ ok: false, message: "extension required" });
    }

    const result = await hangupAgentCallByExtension(extension);
    return res.status(200).json(result);
  } catch (error) {
    console.error("[HangupAgent] endpoint error:", error);
    return res.status(500).json({
      ok: false,
      message: error.message || "Hangup failed",
    });
  }
});

module.exports = router;
