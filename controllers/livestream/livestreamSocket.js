let io;

const setupSocket = (ioInstance) => {
  io = ioInstance;

  io.on("connection", (socket) => {
    console.log("📡 Socket connected:", socket.id);

    socket.on("disconnect", () => {
      console.log("❌ Socket disconnected:", socket.id);
    });
  });
};

const emitCallUpdate = (callData) => {
  if (!io) return console.warn("⚠️ Socket.IO not initialized");
  io.emit("live_call_update", callData);
};

module.exports = { setupSocket, emitCallUpdate };
