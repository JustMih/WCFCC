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
const path = require("path");
const fs = require("fs");
const reportsRoutes = require('./routes/reports.routes');

dotenv.config();
const app = express();
const server = http.createServer(app);

// Middleware
app.use(express.json());
app.use(cors({
  origin: ["http://localhost:3000", "https://10.52.0.19:3000"],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization", "Accept"]
}));

// Voice Notes File Serving
app.get('/voice-notes/:filename', (req, res) => {
  const filename = decodeURIComponent(req.params.filename);
  const filePath = path.join('/var/lib/asterisk/sounds/custom', filename);
  
  console.log(`Attempting to serve: ${filePath}`);
  
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${filePath}`);
    return res.status(404).send('File not found');
  }

  res.sendFile(filePath, {
    headers: {
      'Content-Type': 'audio/wav',
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  });
});

// Other Static Files
app.use("/sounds", express.static("/var/lib/asterisk/sounds", {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.wav')) {
      res.set('Content-Type', 'audio/wav');
    }
  }
}));

// Routes
app.use("/api", routes);
app.use("/api", require("./routes/ivr-dtmf-routes"));
app.use('/api', recordingRoutes);
app.use('/api/holidays', holidayRoutes);
app.use('/api/emergency', require('./routes/emergencyRoutes'));
app.use('/api/reports', reportsRoutes);

// WebSocket Setup
const io = new Server(server, {});
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

// Database and Server Startup
sequelize.sync({ force: false, alter: false })
  .then(() => {
    console.log("Database synced");
    registerSuperAdmin();
    const PORT = process.env.PORT || 5070;
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(error => {
    console.error("Database sync failed:", error);
    process.exit(1);
  });