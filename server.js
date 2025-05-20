const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const sequelize = require("./config/mysql_connection.js");
const routes = require("./routes");
const { registerSuperAdmin } = require("./controllers/auth/authController");
const recordingRoutes = require('./routes/recordingRoutes');
const ChatMassage = require("./models/chart_message")
const { Server } = require("socket.io");
const http = require("http");
const holidayRoutes = require('./routes/holidayRoutes'); // adjust path if needed
const emergencyRoutes = require('./routes/emergencyRoutes');
 
const reportsRoutes = require('./routes/reports.routes');


 




dotenv.config();
const app = express();

app.use("/sounds", express.static("/var/lib/asterisk/sounds", {
  setHeaders: (res, path) => {
    if (path.endsWith('.wav')) {
      res.set('Content-Type', 'audio/wav');
    }
  }
}));

// Middleware
app.use(express.json());
app.use(
  cors({
    origin: "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
  })
);

// Routes
app.use("/api", routes);
app.use("/api", require("./routes/ivr-dtmf-routes"));
// app.use("/sounds", express.static("/var/lib/asterisk/sounds"));
app.use('/api', recordingRoutes);
app.use('/api/holidays', holidayRoutes);
app.use('/api/emergency', require('./routes/emergencyRoutes'));
app.use('/api/reports', reportsRoutes);
 
// Replace existing static file config with:
app.use("/sounds", express.static("/var/lib/asterisk/sounds", {
  setHeaders: (res, path) => {
    if (path.endsWith('.wav')) {
      res.set('Content-Type', 'audio/wav');
    }
  }
}));

// Create HTTP Server & WebSocket Server
const server = http.createServer(app);
const io = new Server(server, {});
 
app.use(cors({
  origin: ["http://localhost:3000", "https://10.52.0.19:3000"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept"]
}));

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

  // Handle user disconnect
  socket.on("disconnect", () => {
    Object.keys(users).forEach((key) => {
      if (users[key] === socket.id) {
        console.log(`User ${key} disconnected`);
        delete users[key];
      }
    });
  });
});

// Start the server and sync database
sequelize.sync({ force: false, alter: false }).then(() => {
  console.log("Database synced");
  registerSuperAdmin(); // Ensure Super Admin is created at startup
  
  const PORT = process.env.PORT || 5070;
  server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}).catch(error => {
  console.error("Database sync failed:", error);
  process.exit(1);
});

 