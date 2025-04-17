const express = require("express");
const router = express.Router();

// 🔁 Sahihi path ikiwa uko ndani ya "controllers/ivrAction/ivrDTMFController.js"
const ivrDTMFController = require("../controllers/ivrAction/ivrDTMFController");

router.post("/ivr/dtmf-mappings", ivrDTMFController.addIVRDTMFMapping);
router.get("/ivr/dtmf-mappings", ivrDTMFController.getAllMappings);

module.exports = router;
