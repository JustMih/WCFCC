 const express = require("express");
const router = express.Router();
const { spyOnCall } = require("../controllers/spyController");
//get all live calls
const {
  getAllLiveCalls,
  
} = require("../controllers/livestream/livestreamController");

router.get("/live-calls", getAllLiveCalls);
router.post("/spy", spyOnCall);

module.exports = router;
