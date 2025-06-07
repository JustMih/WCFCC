const sequelize = require("../../config/mysql_connection");
const { DataTypes } = require("sequelize");

// Directly load the model from LiveCall.js
const LiveCall = require("../../models/LiveCall")(sequelize, DataTypes);

let ioInstance = null;

const setupSocket = (io) => {
  ioInstance = io;
  io.on("connection", (socket) => {
    console.log("📡 LiveCall client connected:", socket.id);

    socket.on("disconnect", () => {
      console.log("📴 LiveCall client disconnected:", socket.id);
    });
  });
};

const emitLiveCall = (callData) => {
  if (!ioInstance) return;
  ioInstance.emit("live_call_update", callData);
};

// REST API to get all calls
const getAllLiveCalls = async (req, res) => {
  try {
    const calls = await LiveCall.findAll({ order: [["call_start", "DESC"]] });
    res.status(200).json(calls);
  } catch (err) {
    console.error("Error fetching live calls:", err);
    res.status(500).json({ error: "Failed to fetch calls" });
  }
};

module.exports = {
  setupSocket,
  emitLiveCall,
  getAllLiveCalls
};
