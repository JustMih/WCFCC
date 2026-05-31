const sequelize = require("../../config/mysql_connection");
const { buildSlaMetricsFromRow } = require("../../utils/slaMetricsHelper");
const {
  VIEW_NAME,
  ensureCallSummaryReady,
  buildDateRangeWhereBound,
  buildSlaAggregateSelect,
  buildCdrDestinationWhere,
} = require("../../utils/callSummaryReportHelper");
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
    await ensureCallSummaryReady(sequelize);
    const slaSelect = buildSlaAggregateSelect();
    const dateFilter = buildDateRangeWhereBound(
      "cs",
      `${startDate} 00:00:00`,
      `${endDate} 23:59:59`
    );
    const destFilter = buildCdrDestinationWhere("cs");

    const [summaryRow] = await sequelize.query(
      `
      SELECT ${slaSelect}
      FROM ${VIEW_NAME} cs
      WHERE ${dateFilter.sql}
        AND ${destFilter.sql}
      `,
      {
        replacements: {
          ...dateFilter.replacements,
          ...destFilter.replacements,
        },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const dailyRows = await sequelize.query(
      `
      SELECT
        DATE(cs.call_start) AS date,
        ${slaSelect}
      FROM ${VIEW_NAME} cs
      WHERE ${dateFilter.sql}
        AND ${destFilter.sql}
      GROUP BY DATE(cs.call_start)
      ORDER BY date ASC
      `,
      {
        replacements: {
          ...dateFilter.replacements,
          ...destFilter.replacements,
        },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const summary = buildSlaMetricsFromRow(summaryRow);
    const daily = dailyRows.map((row) =>
      buildSlaMetricsFromRow(row, row.date)
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
        u2.full_name AS creator_name
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
    };

    const rows = tickets.map((ticket) => {
      const compliance = checkSLACompliance(ticket);
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
        default:
          summary.unknown += 1;
      }
      summary.total += 1;

      return {
        id: ticket.id,
        ticket_id: ticket.ticket_id || ticket.id,
        subject: ticket.subject || "-",
        status: ticket.status || "-",
        workflow_current_role: ticket.workflow_current_role || "-",
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
