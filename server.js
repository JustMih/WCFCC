const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const sequelize = require("./config/mysql_connection.js");
const routes = require("./routes");
const { registerSuperAdmin } = require("./controllers/auth/authController");
const {
  connectAsterisk,
  makeCall,
} = require("./controllers/ami/amiController");
const ChatMassage = require("./models/chart_message")
const { Server } = require("socket.io");
const http = require("http");

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());
app.use("/api", routes);

// Create HTTP Server & WebSocket Server
const server = http.createServer(app);
const io = new Server(server, {
  // test
  // cors: {
  //   origin: "http://localhost:3000",
  //   methods: ["GET", "POST"],
  // },
  // live
  cors: {
    origin: "http://10.57.0.16:3022",
    methods: ["GET", "POST"],
  },
});

const users = {}; // Store connected users (agent/supervisor)

io.on("connection", (socket) => {
  console.log("New user connected:", socket.id);

  // Store user ID with their socket
  socket.on("register", (userId) => {
    users[userId] = socket.id;
    console.log(`User ${userId} connected with socket ${socket.id}`);
  });

  // Private messaging (agent -> supervisor)
  socket.on("private_message", async ({ senderId, receiverId, message }) => {
    console.log(`Message from ${senderId} to ${receiverId}: ${message}`);

    // Save message to MySQL
    await ChatMassage.create({
      senderId,
      receiverId,
      message,
    });

    // Send message to the recipient if online
    if (users[receiverId]) {
      io.to(users[receiverId]).emit("private_message", {
        senderId,
        receiverId,
        message,
      });
    } else {
      console.warn(`User ${receiverId} is offline, message not delivered.`);
    }

    // Also send the message back to the sender to update their UI
    if (users[senderId]) {
      io.to(users[senderId]).emit("private_message", {
        senderId,
        receiverId,
        message,
      });
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

// Ensure Asterisk is connected before syncing the database and starting the server
connectAsterisk()
  .then(() => {
    console.log("Asterisk connected successfully");

    sequelize.sync({ force: false, alter: false }).then(() => {
      console.log("Database synced");
      registerSuperAdmin(); // Ensure Super Admin is created at startup
    });

    const PORT = process.env.PORT || 5070;
    // app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((error) => {
    console.error("Asterisk connection failed:", error);
    process.exit(1); // Exit the process if Asterisk connection fails
  });
