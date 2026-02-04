const sequelize = require("../../config/database");
const { QueryTypes } = require("sequelize");

/* ================= SOCKET.IO ================= */
/**
 * Emit ticket summary update via Socket.IO for real-time dashboard updates
 * @param {Object} payload - The ticket summary data to emit
 */
const emitTicketSummaryUpdate = (payload) => {
  if (global._io) {
    global._io.emit("ticket_summary_update", payload);
  }
};

/**
 * Get comprehensive ticket summary report from ticket_view
 * Supports optional date range filtering via query parameters
 * Emits real-time updates via Socket.IO for dashboard consumption
 * @route GET /api/ticket/ticket-summary
 * @query {string} [startDate] - Start date (YYYY-MM-DD or YYYY-MM-DD HH:mm:ss)
 * @query {string} [endDate] - End date (YYYY-MM-DD or YYYY-MM-DD HH:mm:ss)
 */
const getTicketSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Determine date range - use defaults if not provided
    let dateFilter = "";
    let dateParams = {};
    let actualStartDate, actualEndDate;

    if (startDate && endDate) {
      // Use provided date range
      actualStartDate = startDate.includes(" ") ? startDate : `${startDate} 00:00:00`;
      actualEndDate = endDate.includes(" ") ? endDate : `${endDate} 23:59:59`;
      dateFilter = "WHERE request_registered_date BETWEEN :startDate AND :endDate";
      dateParams = { startDate: actualStartDate, endDate: actualEndDate };
    } else {
      // Use default: current year
      const now = new Date();
      const currentYear = now.getFullYear();
      actualStartDate = `${currentYear}-01-01 00:00:00`;
      actualEndDate = `${currentYear}-12-31 23:59:59`;
      dateFilter = "WHERE request_registered_date BETWEEN :startDate AND :endDate";
      dateParams = { startDate: actualStartDate, endDate: actualEndDate };
    }

    // 1. Total Tickets
    const totalTicketsQuery = `
      SELECT COUNT(*) AS total
      FROM ticket_view
      ${dateFilter}
    `;
    const totalTicketsResult = await sequelize.query(totalTicketsQuery, {
      replacements: dateParams,
      type: QueryTypes.SELECT,
    });
    const totalTickets = parseInt(totalTicketsResult[0]?.total || 0);

    // 2. Tickets by Status
    const byStatusQuery = `
      SELECT 
        status,
        COUNT(*) AS count
      FROM ticket_view
      ${dateFilter}
      GROUP BY status
      ORDER BY count DESC
    `;
    const byStatus = await sequelize.query(byStatusQuery, {
      replacements: dateParams,
      type: QueryTypes.SELECT,
    });

    // 3. Tickets by Category
    const byCategoryQuery = `
      SELECT 
        category,
        COUNT(*) AS count
      FROM ticket_view
      ${dateFilter}
      GROUP BY category
      ORDER BY count DESC
    `;
    const byCategory = await sequelize.query(byCategoryQuery, {
      replacements: dateParams,
      type: QueryTypes.SELECT,
    });

    // 4. Tickets by Complaint Type (only for Complaints)
    const byComplaintTypeQuery = `
      SELECT 
        complaint_type AS type,
        COUNT(*) AS count
      FROM ticket_view
      ${dateFilter}
      AND category = 'Complaint'
      AND complaint_type IS NOT NULL
      GROUP BY complaint_type
      ORDER BY count DESC
    `;
    const byComplaintType = await sequelize.query(byComplaintTypeQuery, {
      replacements: dateParams,
      type: QueryTypes.SELECT,
    });

    // 5. Overdue Tickets (aging_days > 10 or based on SLA)
    const overdueTicketsQuery = `
      SELECT COUNT(*) AS total
      FROM ticket_view
      ${dateFilter}
      AND status NOT IN ('Closed', 'Resolved')
      AND (
        aging_days > 10
        OR (category = 'Inquiry' AND aging_days > 5)
        OR (category = 'Complaint' AND complaint_type = 'Minor' AND aging_days > 10)
        OR (category = 'Complaint' AND complaint_type = 'Major' AND aging_days > 15)
      )
    `;
    const overdueTicketsResult = await sequelize.query(overdueTicketsQuery, {
      replacements: dateParams,
      type: QueryTypes.SELECT,
    });
    const overdueTickets = parseInt(overdueTicketsResult[0]?.total || 0);

    // 6. Resolved Tickets
    const resolvedTicketsQuery = `
      SELECT COUNT(*) AS total
      FROM ticket_view
      ${dateFilter}
      AND status = 'Closed'
      AND date_of_resolution IS NOT NULL
    `;
    const resolvedTicketsResult = await sequelize.query(resolvedTicketsQuery, {
      replacements: dateParams,
      type: QueryTypes.SELECT,
    });
    const resolvedTickets = parseInt(resolvedTicketsResult[0]?.total || 0);

    // 7. Open Tickets
    const openTicketsQuery = `
      SELECT COUNT(*) AS total
      FROM ticket_view
      ${dateFilter}
      AND status = 'Open'
    `;
    const openTicketsResult = await sequelize.query(openTicketsQuery, {
      replacements: dateParams,
      type: QueryTypes.SELECT,
    });
    const openTickets = parseInt(openTicketsResult[0]?.total || 0);

    // 8. In Progress Tickets
    const inProgressTicketsQuery = `
      SELECT COUNT(*) AS total
      FROM ticket_view
      ${dateFilter}
      AND status IN ('In Progress', 'Assigned')
    `;
    const inProgressTicketsResult = await sequelize.query(inProgressTicketsQuery, {
      replacements: dateParams,
      type: QueryTypes.SELECT,
    });
    const inProgressTickets = parseInt(inProgressTicketsResult[0]?.total || 0);

    // 9. Ticket Trends - Daily (for Area Chart)
    const dailyTrendQuery = `
      SELECT 
        DATE(request_registered_date) AS date,
        COUNT(*) AS count
      FROM ticket_view
      ${dateFilter}
      GROUP BY DATE(request_registered_date)
      ORDER BY date DESC
    `;
    const dailyTrend = await sequelize.query(dailyTrendQuery, {
      replacements: dateParams,
      type: QueryTypes.SELECT,
    });

    // 10. Ticket Trends - Monthly (for Area Chart)
    const monthlyTrendQuery = `
      SELECT 
        YEAR(request_registered_date) AS year,
        MONTH(request_registered_date) AS month,
        COUNT(*) AS count
      FROM ticket_view
      ${dateFilter}
      GROUP BY YEAR(request_registered_date), MONTH(request_registered_date)
      ORDER BY year DESC, month DESC
    `;
    const monthlyTrend = await sequelize.query(monthlyTrendQuery, {
      replacements: dateParams,
      type: QueryTypes.SELECT,
    });

    // 11. Ticket Trends - Yearly (for Area Chart)
    const yearlyTrendQuery = `
      SELECT 
        YEAR(request_registered_date) AS year,
        COUNT(*) AS count
      FROM ticket_view
      ${dateFilter}
      GROUP BY YEAR(request_registered_date)
      ORDER BY year DESC
    `;
    const yearlyTrend = await sequelize.query(yearlyTrendQuery, {
      replacements: dateParams,
      type: QueryTypes.SELECT,
    });

    // 12. Status Distribution (for Radial Chart)
    const statusDistributionQuery = `
      SELECT 
        status,
        COUNT(*) AS count
      FROM ticket_view
      ${dateFilter}
      GROUP BY status
      ORDER BY count DESC
    `;
    const statusDistribution = await sequelize.query(statusDistributionQuery, {
      replacements: dateParams,
      type: QueryTypes.SELECT,
    });

    // Calculate percentages for status distribution
    const statusDistributionWithPercentages = statusDistribution.map((row) => ({
      status: row.status,
      count: parseInt(row.count || 0),
      percentage: totalTickets > 0 
        ? parseFloat(((parseInt(row.count || 0) / totalTickets) * 100).toFixed(2))
        : 0,
    }));

    // Format response
    const response = {
      stats: {
        totalTickets,
        byStatus: byStatus.map((row) => ({
          status: row.status,
          count: parseInt(row.count || 0),
        })),
        byCategory: byCategory.map((row) => ({
          category: row.category,
          count: parseInt(row.count || 0),
        })),
        byComplaintType: byComplaintType.map((row) => ({
          type: row.type,
          count: parseInt(row.count || 0),
        })),
        overdueTickets,
        resolvedTickets,
        openTickets,
        inProgressTickets,
      },
      trends: {
        daily: dailyTrend.map((row) => ({
          date: row.date,
          count: parseInt(row.count || 0),
        })),
        monthly: monthlyTrend.map((row) => ({
          year: parseInt(row.year || 0),
          month: parseInt(row.month || 0),
          count: parseInt(row.count || 0),
        })),
        yearly: yearlyTrend.map((row) => ({
          year: parseInt(row.year || 0),
          count: parseInt(row.count || 0),
        })),
      },
      statusDistribution: {
        data: statusDistributionWithPercentages,
        total: totalTickets,
      },
      dateRange: {
        startDate: actualStartDate || null,
        endDate: actualEndDate || null,
      },
      timestamp: new Date().toISOString(),
    };

    // Emit real-time update via Socket.IO for dashboard
    emitTicketSummaryUpdate(response);

    res.json(response);
  } catch (err) {
    console.error("Error retrieving ticket summary data:", err.message);
    res.status(500).json({
      error: "Internal Server Error",
      message: err.message,
    });
  }
};

/* ================= PERIODIC UPDATES ================= */
/**
 * Start periodic ticket summary updates for real-time dashboard
 * Updates are emitted every 60 seconds (ticket data changes less frequently than live calls)
 */
const startPeriodicTicketSummaryUpdates = () => {
  setInterval(async () => {
    try {
      // Create fake request/response objects to reuse getTicketSummary logic
      const fakeReq = { query: {} }; // Use default date range (current year)
      const fakeRes = { 
        json: () => {}, // No need to send HTTP response, just emit via socket
        status: () => ({ json: () => {} })
      };
      await getTicketSummary(fakeReq, fakeRes);
    } catch (err) {
      console.error("Periodic ticket summary update error:", err);
    }
  }, 60000); // Update every 60 seconds
};

module.exports = {
  getTicketSummary,
  emitTicketSummaryUpdate,
  startPeriodicTicketSummaryUpdates,
};

