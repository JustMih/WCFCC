// routes/missedCallRoutes.js
const express = require("express");
const router = express.Router();
const { MissedCall } = require("../models");
const { Op } = require("sequelize");

// ✅ POST a new missed call
router.post("/", async (req, res) => {
  try {
    const { caller, time, agentId } = req.body;

    // Debug: Log received data
    console.log("🔁 Incoming POST /missed-calls:", { caller, time, agentId });

    // Basic validation
    if (!caller || !time || !agentId) {
      console.warn("⚠️ Missing fields in POST /missed-calls");
      return res.status(400).json({ error: "Missing required fields: caller, time, agentId" });
    }

    // Save to DB
    const missedCall = await MissedCall.create({
      caller,
      time: new Date(time),
      agentId,
    });

    console.log("✅ Missed call saved:", missedCall.toJSON());
    res.status(201).json(missedCall);
  } catch (error) {
    console.error("❌ Error saving missed call:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


// 🔁 GET all or filtered missed calls
router.get("/", async (req, res) => {
  try {
    console.log("📥 GET /missed-calls called with query:", req.query);

    const { agentId, startDate, endDate } = req.query;

    const where = {};

    if (agentId) {
      where.agentId = agentId;
    }

    if (startDate && endDate) {
      where.time = {
        [Op.between]: [new Date(startDate), new Date(endDate)],
      };
    } else if (startDate) {
      where.time = {
        [Op.gte]: new Date(startDate),
      };
    } else if (endDate) {
      where.time = {
        [Op.lte]: new Date(endDate),
      };
    }

    const missedCalls = await MissedCall.findAll({
      where,
      order: [["time", "DESC"]],
    });

    res.json(missedCalls);
  } catch (err) {
    console.error("❌ Error fetching missed calls:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
