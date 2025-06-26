'use strict';

const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const sequelize = require("./config/mysql_connection.js");
const routes = require("./routes");
const { registerSuperAdmin } = require("./controllers/auth/authController");
const recordingRoutes = require("./routes/recordingRoutes");
const instagramWebhookRoutes = require("./routes/instagramWebhookRoutes");
const monitorRoutes = require('./routes/monitorRoutes');
const holidayRoutes = require('./routes/holidayRoutes');
const emergencyRoutes = require('./routes/emergencyRoutes');
const livestreamRoutes = require("./routes/livestreamRoutes");
 

const { setupSocket } = require("./controllers/livestream/livestreamController");
const { startCELWatcher } = require("./controllers/livestream/celLiveEmitter");
startCELWatcher(); // 🔁 Start CEL live call background loop

const recordedAudioRoutes = require('./routes/recordedAudioRoutes');
const reportsRoutes = require('./routes/reports.routes');

const ChatMassage = require("./models/chart_message");
const InstagramComment = require("./models/instagram_comment");
const VoiceNote = require('./models/voice_notes.model');
//const { setupSocket } = require("./controllers/livestream/livestreamController");

// Initialize Express
const app = express();
const server = http.createServer(app);

// Middleware
app.use(express.json());

app.use(cors({
  origin: ["http://localhost:3000", "http://10.52.0.19:3000"],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

// Serve voice note audio files
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

// Serve static voice and recording files
app.use("/voice", express.static("/opt/wcf_call_center_backend/voice", {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.wav')) {
      res.set('Content-Type', 'audio/wav');
    }
  }
}));

app.use('/recordings', express.static('/opt/wcf_call_center_backend/recorded'));

// Routes
app.use("/api", routes);
app.use("/api", require("./routes/ivr-dtmf-routes"));
app.use("/api", recordingRoutes);
app.use("/api/holidays", holidayRoutes);
app.use("/api/emergency", emergencyRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/recorded-audio", recordedAudioRoutes);
app.use("/api/livestream", livestreamRoutes);
app.use("/api/instagram", instagramWebhookRoutes);
app.use("/api", require("./routes/dtmfRoutes"));


// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "http://10.52.0.19:3000"],
    methods: ["GET", "POST"],
    credentials: true
  }
});
global._io = io;
setupSocket(io);

// Private message socket logic
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

  socket.on("disconnect", () => {
    for (const id in users) {
      if (users[id] === socket.id) {
        console.log(`🛑 User ${id} disconnected`);
        delete users[id];
      }
    }
  });
});

// Start the server
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
