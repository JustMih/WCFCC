const express = require("express");
const router = express.Router();
const { getCdrCounts } = require("../controllers/calls/calls");

router.get("/calls-count", getCdrCounts);

module.exports = router;