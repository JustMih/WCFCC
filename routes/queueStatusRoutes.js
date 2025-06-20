// routes/queueStatusRoutes.js
const express = require("express");
const router = express.Router();

// POST: Receive queue status and broadcast via socket
router.post("/", (req, res) => {
  const queueData = req.body;

  if (!Array.isArray(queueData)) {
    return res.status(400).json({ error: "Expected an array of queue data" });
  }

  // Broadcast to all connected clients
  if (global._io) {
    global._io.emit("queueStatusUpdate", queueData);
    console.log("📡 Broadcasted queue status:", queueData);
  } else {
    console.warn("⚠️ Socket.IO not initialized");
  }

  // (Optional) Save to DB here if needed

  res.status(200).json({ message: "Queue status received and emitted" });
});

module.exports = router;
