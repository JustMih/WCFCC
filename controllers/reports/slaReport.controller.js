const sequelize = require("../../config/mysql_connection");
const { getDashboardSlaReportForRange } = require("../../utils/dashboardSlaHelper");
const { checkSLACompliance } = require("../../services/workflowCommunicationService");

/** Call-center SLA report for a date range (summary + daily breakdown) */
exports.getSlaReport = async (req, res) => {
  const { startDate, endDate } = req.params;

  if (!startDate || !endDate) {
    return res
      .status(400)
      .json({ error: "Start date and end date are required" });
  }

  try {
    const { summary, daily } = await getDashboardSlaReportForRange(
      sequelize,
      startDate,
      endDate
    );
    res.json({ summary, daily });
  } catch (error) {
    console.error("Error fetching SLA report:", error);
    res.status(500).json({ error: error.message });
  }
};

/** Ticket SLA report for tickets created in a date range */
exports.getTicketSlaReport = async (req, res) => {
  const { startDate, endDate } = req.params;
  const statusFilter = (req.query.status || "all").toLowerCase();

  if (!startDate || !endDate) {
    return res
      .status(400)
      .json({ error: "Start date and end date are required" });
  }

  try {
    const tickets = await sequelize.query(
      `
      SELECT
        t.*,
        u1.full_name AS assigned_to_name,
        u2.full_name AS creator_name,
        (
          SELECT MAX(ta.created_at)
          FROM Ticket_assignments ta
          WHERE ta.ticket_id = t.id
            AND ta.assigned_to_id = t.assigned_to_id
            AND LOWER(COALESCE(ta.action, '')) NOT IN ('created', 'closed', 'attended')
        ) AS sla_step_started_at,
        (
          LOWER(COALESCE(t.category, '')) = 'complaint'
          AND LOWER(COALESCE(t.complaint_type, '')) IN ('minor', 'major')
          AND EXISTS (
          SELECT 1
          FROM Ticket_assignments ta
          WHERE ta.ticket_id = t.id
            AND LOWER(COALESCE(ta.action, '')) LIKE '%forward%'
          )
        ) AS has_workflow_evidence
      FROM Tickets t
      LEFT JOIN Users u1 ON t.assigned_to_id = u1.id
      LEFT JOIN Users u2 ON t.created_by = u2.id
      WHERE t.created_at BETWEEN :startDate AND :endDate
      ORDER BY t.created_at DESC
      `,
      {
        replacements: {
          startDate: `${startDate} 00:00:00`,
          endDate: `${endDate} 23:59:59`,
        },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const summary = {
      total: 0,
      onTime: 0,
      approaching: 0,
      overdue: 0,
      noSla: 0,
      unknown: 0,
      notInWorkflow: 0,
    };

    const rows = tickets.map((ticket) => {
      const hasWorkflowEvidence = Boolean(Number(ticket.has_workflow_evidence));
      const compliance =
        !ticket.workflow_path && hasWorkflowEvidence
          ? {
              status: "Unknown",
              details: "Workflow was forwarded but workflow metadata is missing",
            }
          : checkSLACompliance(ticket);
      const slaStatus = compliance?.status || "Unknown";
      const slaDetails = compliance?.details || "";
      const slaSeverity = compliance?.severity || null;

      switch (slaStatus) {
        case "On Time":
          summary.onTime += 1;
          break;
        case "Approaching Deadline":
          summary.approaching += 1;
          break;
        case "Overdue":
          summary.overdue += 1;
          break;
        case "No SLA":
          summary.noSla += 1;
          break;
        case "Not in workflow":
          summary.notInWorkflow += 1;
          break;
        default:
          summary.unknown += 1;
      }
      summary.total += 1;

      return {
        id: ticket.id,
        ticket_id: ticket.ticket_id || ticket.id,
        subject: ticket.subject || "-",
        status: ticket.status || "-",
        workflow_current_role:
          ticket.current_workflow_role || ticket.assigned_to_role || "-",
        assigned_to_name: ticket.assigned_to_name || "-",
        created_at: ticket.created_at,
        sla_status: slaStatus,
        sla_details: slaDetails,
        sla_severity: slaSeverity,
      };
    });

    const statusMap = {
      overdue: "Overdue",
      approaching: "Approaching Deadline",
      "on-time": "On Time",
      ontime: "On Time",
      "no-sla": "No SLA",
      "not-in-workflow": "Not in workflow",
    };

    const filterLabel = statusMap[statusFilter];
    const filtered =
      filterLabel && statusFilter !== "all"
        ? rows.filter((r) => r.sla_status === filterLabel)
        : rows;

    res.json({ summary, tickets: filtered });
  } catch (error) {
    console.error("Error fetching ticket SLA report:", error);
    res.status(500).json({ error: error.message });
  }
};
