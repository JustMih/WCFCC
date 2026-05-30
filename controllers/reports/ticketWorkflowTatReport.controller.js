const sequelize = require("../../config/mysql_connection");
const { buildTatReportPayload } = require("../../utils/ticketWorkflowReportHelper");

exports.getTicketWorkflowTatReport = async (req, res) => {
  const { startDate, endDate, status } = req.params;

  if (!startDate || !endDate) {
    return res
      .status(400)
      .json({ error: "Start date and end date are required" });
  }

  try {
    let query = `
      SELECT
        t.*,
        u2.full_name AS creator_name
      FROM Tickets t
      LEFT JOIN Users u2 ON t.created_by = u2.id
      WHERE t.created_at BETWEEN CONCAT(:startDate, ' 00:00:00') AND CONCAT(:endDate, ' 23:59:59')
        AND EXISTS (
          SELECT 1 FROM Ticket_assignments ta WHERE ta.ticket_id = t.id
        )
    `;

    const replacements = { startDate, endDate };

    if (status && status !== "all") {
      query += ` AND t.status = :status`;
      replacements.status = status;
    }

    query += ` ORDER BY t.created_at DESC`;

    const tickets = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    if (!tickets.length) {
      return res.json({
        summary: { total: 0, resolved: 0, avgTotalTatDays: 0, avgTotalTatMinutes: 0 },
        templateColumns: [],
        rows: [],
      });
    }

    const ticketIds = tickets.map((t) => t.id).filter(Boolean);
    let assignments = [];

    if (ticketIds.length) {
      assignments = await sequelize.query(
        `
        SELECT
          ta.*,
          u.full_name AS assigned_to_name
        FROM Ticket_assignments ta
        LEFT JOIN Users u ON u.id = ta.assigned_to_id
        WHERE ta.ticket_id IN (:ticketIds)
        ORDER BY ta.created_at ASC
        `,
        {
          replacements: { ticketIds },
          type: sequelize.QueryTypes.SELECT,
        }
      );
    }

    const payload = buildTatReportPayload(tickets, assignments);
    res.json(payload);
  } catch (error) {
    console.error("Error fetching ticket workflow TAT report:", error);
    res.status(500).json({ error: error.message });
  }
};
