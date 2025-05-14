const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const sequelize = require("./config/mysql_connection.js");
const routes = require("./routes");
const { registerSuperAdmin } = require("./controllers/auth/authController");
const recordingRoutes = require("./routes/recordingRoutes");
const { connectAsterisk } = require("./controllers/ami/amiController");
const ChatMassage = require("./models/chart_message");
const { Server } = require("socket.io");
const http = require("http");

dotenv.config();
const app = express();

// Middleware
app.use(express.json());
app.use(
  cors({
    origin: "http://localhost:3001",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
  })
);

// Routes
app.use("/api", routes);
app.use("/api", require("./routes/ivr-dtmf-routes"));
app.use("/api", recordingRoutes);

// Serve audio files
app.use(
  "/sounds",
  express.static("/var/lib/asterisk/sounds", {
    setHeaders: (res, path) => {
      if (path.endsWith(".wav")) {
        res.set("Content-Type", "audio/wav");
      } else if (path.endsWith(".mp3")) {
        res.set("Content-Type", "audio/mp3");
      }
    },
  })
);

// Serve audio files for /audio endpoint
app.use(
  "/audio",
  express.static("/var/lib/asterisk/sounds", {
    setHeaders: (res, path) => {
      if (path.endsWith(".mp3")) {
        res.set("Content-Type", "audio/mp3");
      } else if (path.endsWith(".wav")) {
        res.set("Content-Type", "audio/wav");
      }
    },
  })
);

// Create HTTP Server & Socket.IO Server
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3001",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const users = {};

io.on("connection", (socket) => {
  console.log("New user connected:", socket.id);

  socket.on("register", (userId) => {
    users[userId] = socket.id;
    console.log(`User ${userId} connected with socket ${socket.id}`);
  });

  socket.on("private_message", async ({ senderId, receiverId, message }) => {
    console.log(`Message from ${senderId} to ${receiverId}: ${message}`);
    try {
      await ChatMassage.create({ senderId, receiverId, message });
      if (users[receiverId]) {
        io.to(users[receiverId]).emit("private_message", {
          senderId,
          receiverId,
          message,
        });
      } else {
        console.warn(`User ${receiverId} is offline, message not delivered.`);
      }
      if (users[senderId]) {
        io.to(users[senderId]).emit("private_message", {
          senderId,
          receiverId,
          message,
        });
      }
    } catch (error) {
      console.error("Error saving message:", error);
    }
  });

  socket.on("disconnect", () => {
    Object.keys(users).forEach((key) => {
      if (users[key] === socket.id) {
        console.log(`User ${key} disconnected`);
        delete users[key];
      }
    });
  });
});

// Start server
connectAsterisk()
  .then(() => {
    console.log("Asterisk connected successfully!");
    sequelize
      .sync({ force: false, alter: false })
      .then(() => {
        console.log("Database synced");
        registerSuperAdmin();
        const PORT = process.env.PORT || 5070;
        server.listen(PORT, () => {
          console.log(`Server running on http://10.52.0.19:${PORT}`);
        });
      })
      .catch((error) => {
        console.error("Database sync failed:", error);
        process.exit(1);
      });
  })
  .catch((error) => {
    console.error("Asterisk connection failed:", error);
    process.exit(1);
  });