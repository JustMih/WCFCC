 const express = require("express");
const router = express.Router();
//get all live calls
const {
  getAllLiveCalls,
  
} = require("../controllers/livestream/livestreamController");

router.get("/live-calls", getAllLiveCalls);
 

module.exports = router;
