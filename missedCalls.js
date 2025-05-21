// routes/missedCalls.js
const express = require("express");
const router = express.Router();
const MissedCall = require("../models/MissedCall"); // Sequelize or Mongoose model

router.post("/", async (req, res) => {
  try {
    const { caller, time, agentId } = req.body;

    if (!caller || !time || !agentId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const newCall = await MissedCall.create({ caller, time, agentId });
    res.status(201).json(newCall);
  } catch (err) {
    console.error("Failed to log missed call:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
