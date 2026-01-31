const express = require("express");
const router = express.Router();
const SpyController = require("../controllers/spy/SpyController");

router.post("/call-control", SpyController.callControl);

module.exports = router;
