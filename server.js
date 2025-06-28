const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const cors = require("cors");
const sequelize = require("./config/mysql_connection.js");
const routes = require("./routes");
const { registerSuperAdmin } = require("./controllers/auth/authController");
const recordingRoutes = require("./routes/recordingRoutes");
const instagramWebhookRoutes = require("./routes/instagramWebhookRoutes");
const ChatMassage = require("./models/chart_message");
const InstagramComment = require("./models/instagram_comment");
const { Server } = require("socket.io");
const http = require("http");
const monitorRoutes = require('./routes/monitorRoutes');


// Initialize Express
const app = express();
const server = http.createServer(app);
const io = new Server(server, {});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: ["http://localhost:3000", "https://10.52.0.19:3000"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept"]
}));

// Static Asterisk sound files
app.use("/sounds", express.static("/var/lib/asterisk/sounds", {
  setHeaders: (res, path) => {
    if (path.endsWith(".wav")) {
      res.set("Content-Type", "audio/wav");
    }
  }
}));

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
app.use("/api", require("./routes/ivr-dtmf-routes"));
app.use("/api", recordingRoutes);
app.use("/", instagramWebhookRoutes); // Mount Instagram webhook routes at root

// WebSocket Logic
const liveCalls = new Map();
const users = {};

io.on("connection", (socket) => {
  console.log("New user connected:", socket.id);

  socket.on("register", (userId) => {
    users[userId] = socket.id;
    console.log(`User ${userId} registered to socket ${socket.id}`);
  });

  socket.on("private_message", async ({ senderId, receiverId, message }) => {
    console.log(`Message from ${senderId} to ${receiverId}: ${message}`);
    await ChatMassage.create({ senderId, receiverId, message });

    if (users[receiverId]) {
      io.to(users[receiverId]).emit("private_message", { senderId, receiverId, message });
    }
    if (users[senderId]) {
      io.to(users[senderId]).emit("private_message", { senderId, receiverId, message });
    }
  });

  socket.on("disconnect", () => {
    for (const [key, val] of Object.entries(users)) {
      if (val === socket.id) {
        console.log(`User ${key} disconnected`);
        delete users[key];
      }
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
});

// Start the server after DB sync
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
