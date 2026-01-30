"use strict";

/* ------------------------------ ENV & MODULES ------------------------------ */
require("dotenv").config();
const express = require("express");
const http = require("http");
const https = require("https");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { Server } = require("socket.io");
const amiLive = require("./amiServer");

/* ------------------------------ CONFIG & DB ------------------------------ */
const sequelize = require("./config/mysql_connection.js");

// If DB is unreachable in dev environments, you can keep the server running by setting:
// - ALLOW_NO_DB=true   (recommended for local dev when DB is not reachable)
// - EXIT_ON_DB_FAILURE=false
const ALLOW_NO_DB =
  String(process.env.ALLOW_NO_DB || "").toLowerCase() === "true" ||
  String(process.env.EXIT_ON_DB_FAILURE || "").toLowerCase() === "false";
let DB_READY = false;

/* ------------------------------ EXPRESS INIT ------------------------------ */
const app = express();
const server = http.createServer(app);

/* ------------------------------ MODELS ------------------------------ */
const ChatMassage = require("./models/chart_message");
const InstagramComment = require("./models/instagram_comment");
const VoiceNote = require("./models/voice_notes.model");

/* ------------------------------ CONTROLLERS ------------------------------ */
const { registerSuperAdmin } = require("./controllers/auth/authController");
/* ✅ REGISTER LIVE CALL CACHE */
app.locals.getLiveCalls = livestreamController.getLiveCallsCache;
const {
  setupSocket,
} = require("./controllers/livestream/livestreamController");
const {
  setSocketInstance,
  startPeriodicUpdates,
} = require("./controllers/publicDashboard/publicDashboardController");

/* ------------------------------ ROUTES ------------------------------ */
const routes = require("./routes");
const recordingRoutes = require("./routes/recordingRoutes");
const instagramWebhookRoutes = require("./routes/instagramWebhookRoutes");
const instagramManagementRoutes = require("./routes/instagramManagementRoutes");
// const monitorRoutes = require('./routes/monitorRoutes');
const holidayRoutes = require("./routes/holidayRoutes");
const emergencyRoutes = require("./routes/emergencyRoutes");
const livestreamRoutes = require("./routes/livestreamRoutes");
const recordedAudioRoutes = require("./routes/recordedAudioRoutes");
const reportsRoutes = require("./routes/reports.routes");
const ivrDtmfRoutes = require("./routes/ivr-dtmf-routes");
const spyRoutes = require("./routes/spy");


// const baseAudioPath = process.env.audio_recorded_path || "/opt/wcf_call_center_backend";
const baseAudioPath =
  process.env.audio_recorded_path || "/opt/wcf_call_center_backend";

require("./cron/escalationJob");

require("./amiServer"); // ✅ This line ensures AMI event listeners start
/* ------------------------------ MIDDLEWARE ------------------------------ */
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://10.52.0.19:3000",
      "http://192.168.21.70:3000",
      "http://localhost:5070",
      "http://10.52.0.19:5070",
      "http://127.0.0.1:5070",
      "http://192.168.1.170:5070",
      "http://192.168.21.70:5070",
      "https://192.168.21.70",
      "https://10.52.0.19",
      "https://demoportal.wcf.go.tz",
      "https://portal.wcf.go.tz",
      "https://essp.wcf.go.tz",
      // Allow any origin in development (you can remove this in production)
      process.env.NODE_ENV === "development" ? true : false,
    ].filter(Boolean),
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
    credentials: true,
  })
);
setInterval(() => {
  if (!amiLive?.getLiveQueueCalls) return;

  const calls = amiLive.getLiveQueueCalls();
  const liveCount = Object.keys(calls).length;

  if (liveCount > 0) {
    console.log("📞 LIVE CALLS (from AMI):");
    Object.values(calls).forEach((c) => {
      console.log({
        caller: c.caller,
        queue: c.queue,
        joinedAt: c.joinedAt,
        answered: c.answered,
        abandoned: c.abandoned,
      });
    });
  }
}, 2000);

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
app.use(
  "/voice",
  express.static(`${baseAudioPath}voice`, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".wav")) {
        res.set("Content-Type", "audio/wav");
      }
    },
  })
);
app.use("/recordings", express.static(`${baseAudioPath}recorded`));

/* ------------------------------ API ROUTES ------------------------------ */
// Static ticket attachment files
app.use(
  "/uploads",
  express.static(path.join(__dirname, "ticket_attachments"), {
    setHeaders: (res, filePath) => {
      // Set appropriate content type based on file extension
      const ext = path.extname(filePath).toLowerCase();
      if (ext === ".pdf") {
        res.set("Content-Type", "application/pdf");
      } else if (ext === ".doc" || ext === ".docx") {
        res.set("Content-Type", "application/msword");
      } else if (ext === ".jpg" || ext === ".jpeg") {
        res.set("Content-Type", "image/jpeg");
      } else if (ext === ".png") {
        res.set("Content-Type", "image/png");
      } else if (ext === ".txt") {
        res.set("Content-Type", "text/plain");
      }
    },
  })
);

// Health check (always available)
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    dbReady: DB_READY,
    allowNoDb: ALLOW_NO_DB,
    time: new Date().toISOString(),
  });
});

// If DB isn't ready, block API routes with a clear 503 instead of crashing later.
app.use("/api", (req, res, next) => {
  if (DB_READY) return next();
  if (req.path === "/health") return next();

  return res.status(503).json({
    success: false,
    code: "DB_NOT_READY",
    message:
      "Database is not connected. Check DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASS or set ALLOW_NO_DB=true for local dev.",
  });
});

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
app.use("/api/instagram-management", instagramManagementRoutes);
app.use("/api", require("./routes/dtmfRoutes"));
app.use("/api/spy", spyRoutes);

/* ------------------------------ SOCKET.IO ------------------------------ */
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "http://10.52.0.19:3000",
      "http://localhost:5070",
      "http://10.52.0.19:5070",
      "http://127.0.0.1:5070",
      "http://192.168.1.170:5070",
      "http://192.168.21.70:5070",
      "https://192.168.21.70",
      "https://10.52.0.19",
      "https://demoportal.wcf.go.tz",
      "https://portal.wcf.go.tz",
      "https://essp.wcf.go.tz",
      // Allow any origin in development
      process.env.NODE_ENV === "development" ? true : false,
    ].filter(Boolean),
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    credentials: true,
  },
});
global._io = io;
setupSocket(io);
setSocketInstance(io);

// Private messaging and live call socket logic
const users = {};
const liveCalls = new Map();

io.on("connection", (socket) => {
  console.log("✅ Socket.IO client connected:", socket.id);

  socket.on("register", (userId) => {
    users[userId] = socket.id;
    console.log(`User ${userId} registered with socket ID ${socket.id}`);

    // Notify all other users that this user is now online
    socket.broadcast.emit("user_online", userId);

    // Send list of currently online users to the newly connected user
    const onlineUserIds = Object.keys(users);
    socket.emit("online_users_list", onlineUserIds);
  });

  socket.on("private_message", async ({ senderId, receiverId, message }) => {
    console.log(`💬 Message from ${senderId} to ${receiverId}: ${message}`);
    try {
      const newMessage = await ChatMassage.create({
        senderId,
        receiverId,
        message,
        isRead: false,
        status: "sent",
      });

      const messageData = {
        id: newMessage.id,
        senderId,
        receiverId,
        message,
        isRead: false,
        status: "sent",
        timestamp: newMessage.createdAt,
        createdAt: newMessage.createdAt,
      };

      // Emit to sender first (optimistic update)
      if (users[senderId]) {
        io.to(users[senderId]).emit("private_message", messageData);
      }

      // Emit to receiver and mark as delivered if online
      if (users[receiverId]) {
        // Mark as delivered
        await ChatMassage.update(
          { status: "delivered", deliveredAt: new Date() },
          { where: { id: newMessage.id } }
        );

        const deliveredMessage = {
          ...messageData,
          status: "delivered",
        };

        io.to(users[receiverId]).emit("private_message", deliveredMessage);

        // Notify sender that message was delivered
        if (users[senderId]) {
          io.to(users[senderId]).emit("message_status_update", {
            messageId: newMessage.id,
            status: "delivered",
          });
        }
      } else {
        // Receiver is offline, mark as delivered anyway (they'll see it when they come online)
        await ChatMassage.update(
          { status: "delivered", deliveredAt: new Date() },
          { where: { id: newMessage.id } }
        );
      }
    } catch (error) {
      console.error("❌ Failed to store or emit message:", error);
    }
  });

  // Handle message delivered confirmation
  socket.on("message_delivered", async (messageId) => {
    try {
      await ChatMassage.update(
        { status: "delivered", deliveredAt: new Date() },
        { where: { id: messageId } }
      );
    } catch (error) {
      console.error("❌ Error updating message delivery status:", error);
    }
  });

  // Mark a message as read when received
  socket.on("messageRead", async (messageId) => {
    try {
      // Update the message as read in the database
      await ChatMassage.update({ isRead: true }, { where: { id: messageId } });
      console.log(`Message ${messageId} marked as read`);
    } catch (error) {
      console.error("❌ Error marking message as read:", error);
    }
  });

  // Handle messages read event
  socket.on("messagesRead", async ({ senderId, receiverId }) => {
    try {
      // Update all unread messages from sender to receiver as read
      const [updatedCount] = await ChatMassage.update(
        { isRead: true, status: "read", readAt: new Date() },
        {
          where: {
            senderId: senderId,
            receiverId: receiverId,
            isRead: false,
          },
        }
      );

      // Get updated message IDs to notify sender
      const updatedMessages = await ChatMassage.findAll({
        where: {
          senderId: senderId,
          receiverId: receiverId,
          status: "read",
        },
        attributes: ["id"],
      });

      // Notify the sender that their messages have been read
      if (users[senderId] && updatedMessages.length > 0) {
        io.to(users[senderId]).emit("messagesRead", {
          senderId,
          receiverId,
          messageIds: updatedMessages.map((m) => m.id),
        });

        // Also send individual status updates
        updatedMessages.forEach((msg) => {
          io.to(users[senderId]).emit("message_status_update", {
            messageId: msg.id,
            status: "read",
          });
        });
      }

      console.log(`Messages from ${senderId} to ${receiverId} marked as read`);
    } catch (error) {
      console.error("❌ Error marking messages as read:", error);
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
        // Notify all other users that this user is now offline
        socket.broadcast.emit("user_offline", id);
      }
    }
  });
});
setInterval(() => {
  if (!amiLive?.getLiveQueueCalls) return;

  const calls = Object.values(amiLive.getLiveQueueCalls());

  io.emit("public_dashboard_update", {
    liveCalls: calls
  });
}, 2000);

/* ------------------------------ SERVER START ------------------------------ */
// Sync database - handle errors gracefully for models managed by migrations
sequelize
  .sync({ force: false, alter: false })
  .then(() => {
    console.log("✅ Database synced");
    DB_READY = true;
    registerSuperAdmin();

    const PORT = process.env.PORT || 5070;
    const HTTPS_PORT = process.env.HTTPS_PORT || 5071;

    // Create HTTP server
    server.listen(PORT, () => {
      console.log(`🚀 HTTP Server running on port ${PORT}`);
    });

    // Create HTTPS server if SSL certificates exist
    const sslOptions = {
      key: fs.existsSync("./ssl/private.key")
        ? fs.readFileSync("./ssl/private.key")
        : null,
      cert: fs.existsSync("./ssl/certificate.crt")
        ? fs.readFileSync("./ssl/certificate.crt")
        : null,
    };

    if (sslOptions.key && sslOptions.cert) {
      const httpsServer = https.createServer(sslOptions, app);
      const httpsIo = new Server(httpsServer, {
        cors: {
          origin: [
            "http://localhost:3000",
            "http://10.52.0.19:3000",
            "http://192.168.21.70:3000",
            "http://localhost:5070",
            "http://10.52.0.19:5070",
            "http://127.0.0.1:5070",
            "http://192.168.1.170:5070",
            "http://192.168.21.70:5070",
            "https://192.168.21.70",
            "https://10.52.0.19",
            "https://demoportal.wcf.go.tz",
            "https://portal.wcf.go.tz",
            "https://essp.wcf.go.tz",
            process.env.NODE_ENV === "development" ? true : false,
          ].filter(Boolean),
          methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
          credentials: true,
        },
      });

      httpsServer.listen(HTTPS_PORT, () => {
        console.log(`🔒 HTTPS Server running on port ${HTTPS_PORT}`);
      });

      // Setup socket for HTTPS
      global._ioHttps = httpsIo;
      setupSocket(httpsIo);
      setSocketInstance(httpsIo);
    } else {
      console.log("⚠️ SSL certificates not found. HTTPS server not started.");
      console.log(
        "📁 Expected files: ./ssl/private.key and ./ssl/certificate.crt"
      );
    }
  })
  .catch((error) => {
    // Handle duplicate constraint errors gracefully (constraints already exist from migrations)
    if (
      error.name === "SequelizeDatabaseError" &&
      (error.original?.code === "ER_FK_DUP_NAME" ||
        error.message?.includes("Duplicate foreign key constraint"))
    ) {
      console.warn(
        "⚠️ Foreign key constraint already exists (likely from migration). Continuing..."
      );
      console.log("✅ Database connection established");
      DB_READY = true;
      registerSuperAdmin();

      const PORT = process.env.PORT || 5070;
      const HTTPS_PORT = process.env.HTTPS_PORT || 5071;

      server.listen(PORT, () => {
        console.log(`🚀 HTTP Server running on port ${PORT}`);
      });

      // Setup HTTPS if certificates exist
      const sslOptions = {
        key: fs.existsSync("./ssl/private.key")
          ? fs.readFileSync("./ssl/private.key")
          : null,
        cert: fs.existsSync("./ssl/certificate.crt")
          ? fs.readFileSync("./ssl/certificate.crt")
          : null,
      };

      if (sslOptions.key && sslOptions.cert) {
        const httpsServer = https.createServer(sslOptions, app);
        const httpsIo = new Server(httpsServer, {
          cors: {
            origin: [
              "http://localhost:3000",
              "http://10.52.0.19:3000",
              "http://192.168.21.70:3000",
              "http://localhost:5070",
              "http://10.52.0.19:5070",
              "http://127.0.0.1:5070",
              "http://192.168.1.170:5070",
              "http://192.168.21.70:5070",
              "https://192.168.21.70",
              "https://10.52.0.19",
              "https://demoportal.wcf.go.tz",
              "https://portal.wcf.go.tz",
              "https://essp.wcf.go.tz",
              process.env.NODE_ENV === "development" ? true : false,
            ].filter(Boolean),
            methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
            credentials: true,
          },
        });

        httpsServer.listen(HTTPS_PORT, () => {
          console.log(`🔒 HTTPS Server running on port ${HTTPS_PORT}`);
        });

        global._ioHttps = httpsIo;
        setupSocket(httpsIo);
        setSocketInstance(httpsIo);
      }
    } else {
      console.error("❌ Database sync failed:", error);
      DB_READY = false;

      // Production: fail fast unless explicitly allowed.
      const isProduction =
        String(process.env.NODE_ENV || "").toLowerCase() === "production";
      const shouldExit = isProduction && !ALLOW_NO_DB;
      if (shouldExit) process.exit(1);

      console.warn(
        "⚠️ Continuing without DB. /api/* routes will return 503 until DB is available."
      );

      const PORT = process.env.PORT || 5070;
      server.listen(PORT, () => {
        console.log(`🚀 HTTP Server running on port ${PORT}`);
      });
    }
  });

  
