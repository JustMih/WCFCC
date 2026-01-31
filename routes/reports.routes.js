const express = require("express");
const router = express.Router();
const reportsController = require("../controllers/reports/reports.controller");

router.get("/voice-notes", reportsController.getVoiceNotes);
router.get("/cdr-reports", reportsController.getCDRReports);
// IVR Interactions - put parameterized route first
router.get(
  "/ivr-interactions/:startDate/:endDate",
  reportsController.getIVRInteractions
);
router.get("/ivr-interactions", reportsController.getIVRInteractions);
// Test endpoint to check table access
router.get("/ivr-interactions-test", reportsController.testIVRTable);
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

// Ticket CRM Report
router.get(
  "/ticket-report/:startDate/:endDate/:status",
  reportsController.getTicketReport
);

// Agent Performance Report
router.get(
  "/agent-performance/:startDate/:endDate/:agentId",
  reportsController.getAgentPerformanceReport
);

// Call Summary Report
router.get(
  "/call-summary/:startDate/:endDate",
  reportsController.getCallSummaryReport
);

// Ticket Assignments Report
router.get(
  "/ticket-assignments/:startDate/:endDate",
  reportsController.getTicketAssignmentsReport
);

module.exports = router;
