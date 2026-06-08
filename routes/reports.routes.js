const express = require("express");
const router = express.Router();

const reportsController = require("../controllers/reports/reports.controller");

let ticketWorkflowTatReportController = {};
try {
  ticketWorkflowTatReportController = require("../controllers/reports/ticketWorkflowTatReport.controller");
} catch (err) {
  console.warn(
    "[reports.routes] ticketWorkflowTatReport.controller:",
    err.message
  );
}

let offHoursReportController = {};
let droppedCallsReportController = {};
let lostCallsReportController = {};
let slaReportController = {};
try {
  offHoursReportController = require("../controllers/reports/offHoursReport.controller");
} catch (err) {
  console.warn("[reports.routes] offHoursReport.controller:", err.message);
}
try {
  droppedCallsReportController = require("../controllers/reports/droppedCallsReport.controller");
} catch (err) {
  console.warn("[reports.routes] droppedCallsReport.controller:", err.message);
}
try {
  lostCallsReportController = require("../controllers/reports/lostCallsReport.controller");
} catch (err) {
  console.warn("[reports.routes] lostCallsReport.controller:", err.message);
}
try {
  slaReportController = require("../controllers/reports/slaReport.controller");
} catch (err) {
  console.warn("[reports.routes] slaReport.controller:", err.message);
}

/** Never pass undefined to router.get — works with legacy routes that use reportsController.getSlaReport */
function bindGet(path, ...handlers) {
  const handler = handlers.find((h) => typeof h === "function");
  if (!handler) {
    console.warn(
      `[reports.routes] No handler for ${path}; registering 503 stub`
    );
    router.get(path, (req, res) => {
      res.status(503).json({
        error: `Report route ${path} is not configured on this server.`,
      });
    });
    return;
  }
  router.get(path, handler);
}

bindGet("/voice-notes", reportsController.getVoiceNotes);
bindGet("/cdr-reports", reportsController.getCDRReports);
bindGet(
  "/ivr-interactions/:startDate/:endDate",
  reportsController.getIVRInteractions
);
bindGet("/ivr-interactions", reportsController.getIVRInteractions);
bindGet("/ivr-interactions-test", reportsController.testIVRTable);
bindGet(
  "/voice-note-report/:startDate/:endDate",
  reportsController.getVoiceReport
);

bindGet(
  "/off-hours-report/:startDate/:endDate",
  offHoursReportController.getOffHoursReport,
  reportsController.getOffHoursReport
);

bindGet(
  "/dropped-calls-report/:startDate/:endDate",
  droppedCallsReportController.getDroppedCallsReport
);

bindGet(
  "/lost-calls-report/:startDate/:endDate",
  lostCallsReportController.getLostCallsReport,
  reportsController.getLostCallsReport
);

bindGet(
  "/cdr-report/:startDate/:endDate/:disposition",
  reportsController.getCDRReport
);
bindGet(
  "/ticket-report/:startDate/:endDate/:status",
  reportsController.getTicketReport
);
bindGet(
  "/agent-performance/:startDate/:endDate/:agentId",
  reportsController.getAgentPerformanceReport
);
bindGet(
  "/call-summary/:startDate/:endDate",
  reportsController.getCallSummaryReport
);
bindGet(
  "/ticket-assignments/:startDate/:endDate",
  reportsController.getTicketAssignmentsReport
);
bindGet(
  "/notification-report/:startDate/:endDate",
  reportsController.getNotificationsReport
);
bindGet(
  "/escalation-report/:startDate/:endDate",
  reportsController.getEscalationReport
);

bindGet(
  "/sla-report/:startDate/:endDate",
  slaReportController.getSlaReport,
  reportsController.getSlaReport
);
bindGet(
  "/ticket-sla-report/:startDate/:endDate",
  slaReportController.getTicketSlaReport,
  reportsController.getTicketSlaReport
);
bindGet(
  "/ticket-workflow-tat/:startDate/:endDate/:status",
  ticketWorkflowTatReportController.getTicketWorkflowTatReport,
  reportsController.getTicketWorkflowTatReport
);

module.exports = router;
