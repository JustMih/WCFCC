const http = require("http");
const socketIO = require("socket.io");
const AsteriskManager = require("asterisk-manager");

// Create HTTP server
const server = http.createServer();
const io = socketIO(server, {
  cors: {
    origin: "*",
  },
});

// Connect to AMI
const ami = new AsteriskManager(5038, "localhost", "admin", "@Ttcl123", true);
ami.keepConnected();

let liveCalls = {}; // Active calls by Uniqueid
let queueCalls = {}; // Queue entries indexed by position or unique ID

ami.on("managerevent", (event) => {
  console.log("📥 AMI Event:", event);

  const {
    event: eventType,
    uniqueid,
    linkedid,
    channel,
    calleridnum,
    connectedlinenum,
    queue,
    position,
    wait
  } = event;

  // Live Calls
  if (eventType === "Newchannel") {
    liveCalls[uniqueid] = {
      channel,
      caller: calleridnum,
      peer: connectedlinenum || "",
      status: "New",
      time: new Date().toLocaleTimeString(),
    };
  }

  if (eventType === "BridgeEnter") {
    if (liveCalls[uniqueid]) {
      liveCalls[uniqueid].status = "In Call";
    }
  }

  if (eventType === "Hangup") {
    delete liveCalls[uniqueid];
  }

  // Queue Entries
  if (eventType === "QueueEntry") {
    queueStatus[uniqueid] = {
      queue,
      callerID: calleridnum,
      position,
      waitTime: wait,
    };
  }

  if (eventType === "AgentConnect" || eventType === "Hangup") {
    delete queueStatus[uniqueid];
  }

  // Emit to clients
  io.emit("live-calls", Object.values(liveCalls));
  io.emit("queue-status", Object.values(queueStatus));
});


// WebSocket connection
io.on("connection", (socket) => {
  console.log("🔌 Client connected to AMI WebSocket");

  // Initial push
  socket.emit("live-calls", Object.values(liveCalls));
  socket.emit("queue-status", Object.values(queueCalls));

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected");
  });
});

server.listen(5071, () => {
  console.log("✅ AMI WebSocket server running on port 5071");
});
