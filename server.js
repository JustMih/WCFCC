const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const sequelize = require("./config/mysql_connection.js");
const routes = require("./routes");
const { registerSuperAdmin } = require("./controllers/auth/authController");
const recordingRoutes = require('./routes/recordingRoutes');
const ChatMassage = require("./models/chart_message");
const { Server } = require("socket.io");
const http = require("http");
const monitorRoutes = require('./routes/monitorRoutes');
const holidayRoutes = require('./routes/holidayRoutes');
const emergencyRoutes = require('./routes/emergencyRoutes');
// const livestreamRoutes = require("./routes/livestreamRoutes");
const livestreamRoutes = require("./routes/livestreamRoutes");
const { setupSocket } = require("./controllers/livestream/livestreamController");
 
const recordedAudioRoutes = require('./routes/recordedAudioRoutes');
const reportsRoutes = require('./routes/reports.routes');
const path = require("path");
const fs = require("fs");
const VoiceNote = require('./models/voice_notes.model'); // ✅ Add this at the top
 
dotenv.config();
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

app.use("/voice", express.static("/opt/wcf_call_center_backend/voice", {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.wav')) {
      res.set('Content-Type', 'audio/wav');
    }
  }
}));


// Routes
app.use("/api", routes);
app.use("/api", require("./routes/ivr-dtmf-routes"));
app.use("/api", recordingRoutes);
app.use("/api/holidays", holidayRoutes);
app.use("/api/emergency", emergencyRoutes);
app.use("/api/reports", reportsRoutes);
// app.use("/api/live-streaming", livestreamRoutes);
app.use("/api/recorded-audio", recordedAudioRoutes);
app.use('/recordings', express.static('/opt/wcf_call_center_backend/recorded'));

app.use("/api/livestream", livestreamRoutes); 



// Setup Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin:  "*",
    methods: ["GET", "POST"],
    credentials: true
  }
});
global._io = io;
setupSocket(io); 

// Private message sockets
const users = {};
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

      // Emit message to both users
      [receiverId, senderId].forEach(id => {
        if (users[id]) {
          io.to(users[id]).emit("private_message", { senderId, receiverId, message });
        }
      });

    } catch (error) {
      console.error("❌ Failed to store or emit message:", error);
    }
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

// Start server after DB sync
sequelize.sync({ force: false, alter: false })
  .then(() => {
    console.log("✅ Database synced");
    registerSuperAdmin();
    const PORT = process.env.PORT || 5070;
    server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  })
  .catch(err => {
    console.error("❌ DB sync error:", err);
    process.exit(1);
  });
  require('./utils/celPoller').startPolling();
