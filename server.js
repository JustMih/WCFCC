'use strict';

/* ------------------------------ ENV & MODULES ------------------------------ */
require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { Server } = require("socket.io");

/* ------------------------------ CONFIG & DB ------------------------------ */
const sequelize = require("./config/mysql_connection.js");

/* ------------------------------ EXPRESS INIT ------------------------------ */
const app = express();
const server = http.createServer(app);

/* ------------------------------ MODELS ------------------------------ */
const ChatMassage = require("./models/chart_message");
const InstagramComment = require("./models/instagram_comment");
const VoiceNote = require('./models/voice_notes.model');

/* ------------------------------ CONTROLLERS ------------------------------ */
const { registerSuperAdmin } = require("./controllers/auth/authController");
const { setupSocket } = require("./controllers/livestream/livestreamController");

/* ------------------------------ ROUTES ------------------------------ */
const routes = require("./routes");
const recordingRoutes = require("./routes/recordingRoutes");
const instagramWebhookRoutes = require("./routes/instagramWebhookRoutes");
// const monitorRoutes = require('./routes/monitorRoutes');
const holidayRoutes = require('./routes/holidayRoutes');
const emergencyRoutes = require('./routes/emergencyRoutes');
const livestreamRoutes = require("./routes/livestreamRoutes");
const recordedAudioRoutes = require('./routes/recordedAudioRoutes');
const reportsRoutes = require('./routes/reports.routes');
const ivrDtmfRoutes = require("./routes/ivr-dtmf-routes");

require('./cron/escalationJob');

require('./amiServer'); // ✅ This line ensures AMI event listeners start
/* ------------------------------ MIDDLEWARE ------------------------------ */
app.use(express.json());
app.use(cors({
  origin: ["http://localhost:3000", "http://10.52.0.19:3000"],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

/* ------------------------------ STATIC FILES ------------------------------ */
// Voice note audio files
app.get("/api/voice-notes/:id/audio", async (req, res) => {
  const { id } = req.params;
  try {
    const voiceNote = await VoiceNote.findByPk(id);
    if (!voiceNote || !voiceNote.recording_path) {
      return res.status(404).send("Voice note not found");
    }

    const filePath = path.resolve(voiceNote.recording_path);
    if (!fs.existsSync(filePath)) {
      return res.status(404).send("Voice file not found on disk");
    }

    res.sendFile(filePath, (err) => {
      if (err) {
        console.error("Failed to send audio file:", err);
        res.status(500).send("Error sending file");
      }
    });
  } catch (error) {
    console.error("Unexpected error fetching voice note:", error);
    res.status(500).send("Internal server error");
  }
});

// Static folders for voice and recorded audio
app.use("/voice", express.static("/opt/wcf_call_center_backend/voice", {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.wav')) {
      res.set('Content-Type', 'audio/wav');
    }
  }
}));
app.use('/recordings', express.static('/opt/wcf_call_center_backend/recorded'));

/* ------------------------------ API ROUTES ------------------------------ */
// Static ticket attachment files
app.use("/uploads", express.static(path.join(__dirname, "ticket_attachments"), {
  setHeaders: (res, filePath) => {
    // Set appropriate content type based on file extension
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.pdf') {
      res.set("Content-Type", "application/pdf");
    } else if (ext === '.doc' || ext === '.docx') {
      res.set("Content-Type", "application/msword");
    } else if (ext === '.jpg' || ext === '.jpeg') {
      res.set("Content-Type", "image/jpeg");
    } else if (ext === '.png') {
      res.set("Content-Type", "image/png");
    } else if (ext === '.txt') {
      res.set("Content-Type", "text/plain");
    }
  }
}));

// API routes
app.use("/api", routes);
app.use("/api", ivrDtmfRoutes);
app.use("/api", recordingRoutes);
app.use("/api/holidays", holidayRoutes);
app.use("/api/emergency", emergencyRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/recorded-audio", recordedAudioRoutes);
app.use("/api/livestream", livestreamRoutes);
app.use("/api/instagram", instagramWebhookRoutes);
app.use("/api", require("./routes/dtmfRoutes"));

/* ------------------------------ SOCKET.IO ------------------------------ */
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "http://10.52.0.19:3000"],
    methods: ["GET", "POST"],
    credentials: true
  }
});
global._io = io;
setupSocket(io);

// Private messaging and live call socket logic
const users = {};
const liveCalls = new Map();

io.on("connection", (socket) => {
  console.log("✅ Socket.IO client connected:", socket.id);

  socket.on("register", (userId) => {
    users[userId] = socket.id;
    console.log(`User ${userId} registered with socket ID ${socket.id}`);
  });

  socket.on("private_message", async ({ senderId, receiverId, message }) => {
    console.log(`💬 Message from ${senderId} to ${receiverId}: ${message}`);
    try {
      await ChatMassage.create({ senderId, receiverId, message });

      [receiverId, senderId].forEach(id => {
        if (users[id]) {
          io.to(users[id]).emit("private_message", { senderId, receiverId, message });
        }
      });
    } catch (error) {
      console.error("❌ Failed to store or emit message:", error);
    }
  });

  socket.on("callStatusUpdate", (callData) => {
    const { callId, status } = callData;
    if (status === "Idle" || status === "Ended") {
      liveCalls.delete(callId);
    } else {
      liveCalls.set(callId, callData);
    }
    io.emit("dashboardUpdate", Array.from(liveCalls.values()));
  });

  socket.on("queueStatusUpdate", (data) => {
    console.log("📥 Received queue status via socket:", data);
    // Broadcast to others
    io.emit("queueStatusUpdate", data);

    // (Optional) Save to DB here
  });

  socket.on("disconnect", () => {
    for (const id in users) {
      if (users[id] === socket.id) {
        console.log(`🛑 User ${id} disconnected`);
        delete users[id];
      }
    }
  });
});

/* ------------------------------ SERVER START ------------------------------ */
sequelize.sync({ force: false, alter: false }).then(() => {
  console.log("✅ Database synced");
  registerSuperAdmin();

  const PORT = process.env.PORT || 5070;
  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}).catch(error => {
  console.error("❌ Database sync failed:", error);
  process.exit(1);
});
