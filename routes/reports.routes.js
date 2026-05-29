const express = require("express");
const router = express.Router();
const reportsController = require("../controllers/reports/reports.controller");
const offHoursReportController = require("../controllers/reports/offHoursReport.controller");
const slaReportController = require("../controllers/reports/slaReport.controller");

function bindGet(path, handler, label) {
  if (typeof handler !== "function") {
    throw new Error(
      `Reports route "${path}" is missing handler "${label}". ` +
        "Deploy the latest WCFCC controllers/reports/*.controller.js files."
    );
  }
  router.get(path, handler);
}

bindGet("/voice-notes", reportsController.getVoiceNotes, "getVoiceNotes");
bindGet("/cdr-reports", reportsController.getCDRReports, "getCDRReports");
bindGet(
  "/ivr-interactions/:startDate/:endDate",
  reportsController.getIVRInteractions,
  "getIVRInteractions"
);
bindGet("/ivr-interactions", reportsController.getIVRInteractions, "getIVRInteractions");
bindGet(
  "/ivr-interactions-test",
  reportsController.testIVRTable,
  "testIVRTable"
);
bindGet(
  "/voice-note-report/:startDate/:endDate",
  reportsController.getVoiceReport,
  "getVoiceReport"
);

bindGet(
  "/off-hours-report/:startDate/:endDate",
  offHoursReportController.getOffHoursReport,
  "getOffHoursReport"
);

bindGet(
  "/cdr-report/:startDate/:endDate/:disposition",
  reportsController.getCDRReport,
  "getCDRReport"
);
bindGet(
  "/ticket-report/:startDate/:endDate/:status",
  reportsController.getTicketReport,
  "getTicketReport"
);
bindGet(
  "/agent-performance/:startDate/:endDate/:agentId",
  reportsController.getAgentPerformanceReport,
  "getAgentPerformanceReport"
);
bindGet(
  "/call-summary/:startDate/:endDate",
  reportsController.getCallSummaryReport,
  "getCallSummaryReport"
);
bindGet(
  "/ticket-assignments/:startDate/:endDate",
  reportsController.getTicketAssignmentsReport,
  "getTicketAssignmentsReport"
);
bindGet(
  "/notification-report/:startDate/:endDate",
  reportsController.getNotificationsReport,
  "getNotificationsReport"
);
bindGet(
  "/escalation-report/:startDate/:endDate",
  reportsController.getEscalationReport,
  "getEscalationReport"
);

bindGet(
  "/sla-report/:startDate/:endDate",
  slaReportController.getSlaReport,
  "getSlaReport"
);
bindGet(
  "/ticket-sla-report/:startDate/:endDate",
  slaReportController.getTicketSlaReport,
  "getTicketSlaReport"
);

module.exports = router;
