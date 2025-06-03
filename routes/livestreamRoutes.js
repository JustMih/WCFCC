// const express = require("express");
// const router = express.Router();

// // Import the controller from the correct path
// const { rtpPacketHandler } = require("../controllers/livestream/livestreamController");

// // Example route for RTP live streaming
// router.get("/live-streaming", (req, res) => {
//   res.send("Live RTP Streaming Endpoint");
// });

// // Route for triggering RTP packet handling (this could be called upon event)
// router.post("/emit-rtp", (req, res) => {
//   const { ts, seq, len, source_ip, source_port } = req.body; // assuming RTP packet data is sent in the request body
  
//   // Trigger the rtpPacketHandler to emit the data to clients
//   const rtpPacket = { ts, seq, len, source_ip, source_port };
//   rtpPacketHandler(rtpPacket);

//   res.status(200).send("RTP packet emitted successfully");
// });

// module.exports = router;
const express = require("express");
const router = express.Router();
const { rtpPacketHandler } = require("../controllers/livestream/livestreamController");

router.post("/emit-rtp", (req, res) => {
  const { ts, seq, len, source_ip, source_port } = req.body;

  const rtpPacket = { ts, seq, len, source_ip, source_port };
  rtpPacketHandler(rtpPacket);

  res.status(200).send("RTP packet emitted successfully");
});

module.exports = router;
