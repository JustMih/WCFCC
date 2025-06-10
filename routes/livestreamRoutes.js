  const express = require("express");
const router = express.Router();
const { getAllLiveCalls } = require("../controllers/livestream/livestreamController");

router.get("/live-calls", getAllLiveCalls);

module.exports = router;

