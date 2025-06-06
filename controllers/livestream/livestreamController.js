// const { Server } = require("socket.io");
// let io;  

// // Initialize WebSocket server
// const initializeSocket = (server) => {
//   io = new Server(server, {});
//   io.on("connection", (socket) => {
//     console.log("New user connected", socket.id);
//     // You can listen to custom events from the frontend here if needed
//     socket.on("disconnect", () => {
//       console.log("User disconnected");
//     });
//   });
// };

// // Emit RTP packet data to all connected clients (Supervisor's frontend)
// const rtpPacketHandler = (packet) => {
//   console.log("Emitting RTP packet:", packet);
//   if (io) {
//     io.emit("rtp_update", {
//       timestamp: packet.ts,
//       seq: packet.seq,
//       len: packet.len,
//       source_ip: packet.source_ip,
//       source_port: packet.source_port,
//     });
//   }
// };

// module.exports = { initializeSocket, rtpPacketHandler };
// let io;  // This will be injected from server.js

// // Called once from server.js with the existing io instance
// const setupSocket = (ioInstance) => {
//   io = ioInstance;

//   io.on("connection", (socket) => {
//     console.log("🔌 New socket connected:", socket.id);

//     socket.on("disconnect", () => {
//       console.log("🔌 Socket disconnected:", socket.id);
//     });
//   });
// };

// // Emits RTP packet data to all connected clients
// const rtpPacketHandler = (packet) => {
//   if (!io) return console.warn("⚠️ Socket.IO not initialized");

//   console.log("📡 Emitting RTP packet:", packet);
//   io.emit("rtp_update", {
//     timestamp: packet.ts,
//     seq: packet.seq,
//     len: packet.len,
//     source_ip: packet.source_ip,
//     source_port: packet.source_port,
//   });
// };

// module.exports = { setupSocket, rtpPacketHandler };
const LiveCall = require("../../models/LiveCall");

const getAllLiveCalls = async (req, res) => {
  try {
    const calls = await LiveCall.findAll({
      order: [['call_start', 'DESC']]
    });
    res.json(calls);
  } catch (err) {
    console.error("Error fetching live calls:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = { getAllLiveCalls };
