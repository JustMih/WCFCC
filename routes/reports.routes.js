const express = require("express");
const router = express.Router();
const reportsController = require("../controllers/reports/reports.controller");

router.get("/voice-notes", reportsController.getVoiceNotes);
router.get("/cdr-reports", reportsController.getCDRReports);
router.get("/ivr-interactions", reportsController.getIVRInteractions);
// get voice note report by date range
router.get(
  "/voice-note-report/:startDate/:endDate",
  reportsController.getVoiceReport
);

// get CDR report by date range and disposition
router.get(
  "/cdr-report/:startDate/:endDate/:disposition",
  reportsController.getCDRReport
);

module.exports = router;
