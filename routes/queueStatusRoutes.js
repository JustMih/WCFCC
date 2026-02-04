const express = require("express");
const router = express.Router();
const db = require("../models");

const QueueStatus = db.QueueStatus;

// 🛡 Defensive check to catch missing model
if (!QueueStatus) {
  console.error("❌ QueueStatus model is undefined. Check your model registration.");
}

// ✅ GET: Fetch the latest saved queue snapshot
router.get("/", async (req, res) => {
  if (!QueueStatus) {
    return res.status(500).json({ error: "QueueStatus model is not loaded" });
  }

  try {
    const data = await QueueStatus.findAll({
      order: [["queue", "ASC"]],
    });
    res.status(200).json(data);
  } catch (error) {
    console.error("❌ Failed to fetch queue status:", error);
    res.status(500).json({ error: "Could not retrieve queue status" });
  }
});

// ✅ POST: Save and broadcast live queue status
router.post("/", async (req, res) => {
  if (!QueueStatus) {
    return res.status(500).json({ error: "QueueStatus model is not loaded" });
  }

  const queueData = req.body;

  if (!Array.isArray(queueData)) {
    return res.status(400).json({ error: "Expected an array of queue data" });
  }

  try {
    // Clear existing snapshot
    await QueueStatus.destroy({ where: {} });

    // Insert new data
    await QueueStatus.bulkCreate(queueData);

    // Emit via socket
    if (global._io) {
      global._io.emit("queueStatusUpdate", queueData);
      console.log("📡 Broadcasted + saved queue status:", queueData);
    } else {
      console.warn("⚠️ Socket.IO not initialized");
    }

    res.status(201).json({ message: "Queue status saved and emitted" });
  } catch (error) {
    console.error("❌ Error saving queue status:", error);
    res.status(500).json({ error: "Failed to save queue data" });
  }
});

module.exports = router;

