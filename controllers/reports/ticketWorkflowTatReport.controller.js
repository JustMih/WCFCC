const sequelize = require("../../config/mysql_connection");
const { buildHolidaySet } = require("../../utils/offHoursHelper");
const {
  buildTatReportPayload,
  resolveRated,
  resolveChannel,
} = require("../../utils/ticketWorkflowReportHelper");

async function fetchHolidayDateKeys() {
  let holidayRows = [];
  try {
    const models = require("../../models");
    if (models.holidays) {
      holidayRows = await models.holidays.findAll({
        attributes: ["holiday_date"],
      });
    }
  } catch {
    holidayRows = [];
  }

  if (!holidayRows.length) {
    try {
      holidayRows = await sequelize.query(
        `SELECT holiday_date FROM holidays`,
        { type: sequelize.QueryTypes.SELECT }
      );
    } catch {
      holidayRows = [];
    }
  }

  return [...buildHolidaySet(holidayRows)];
}

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
        u2.full_name AS creator_name,
        u2.role AS creator_role
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

    const holidays = await fetchHolidayDateKeys();
    const payload = buildTatReportPayload(tickets, assignments, { holidays });

    // Ensure dimension columns are always present on each row (guards stale module cache).
    payload.rows = payload.rows.map((row, index) => {
      const ticket = tickets[index];
      if (!ticket) return row;
      const rated = resolveRated(ticket);
      const channel = resolveChannel(ticket);
      return {
        ...row,
        category: ticket.category || row.category || "",
        rated,
        channel,
        complaint_type: rated || ticket.complaint_type || row.complaint_type || "",
      };
    });

    res.json(payload);
  } catch (error) {
    console.error("Error fetching ticket workflow TAT report:", error);
    res.status(500).json({ error: error.message });
  }
};
