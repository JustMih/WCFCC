const sequelize = require("../../config/database");
const { QueryTypes } = require("sequelize");

/**
 * Get comprehensive call summary report from call_summary view
 * Supports optional date range filtering via query parameters
 * @route GET /api/call-summary/call-summary
 * @query {string} [startDate] - Start date (YYYY-MM-DD or YYYY-MM-DD HH:mm:ss)
 * @query {string} [endDate] - End date (YYYY-MM-DD or YYYY-MM-DD HH:mm:ss)
 */
const getCallSummary = async (req, res) => {
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
      dateFilter = "WHERE call_start BETWEEN :startDate AND :endDate";
      dateParams = { startDate: actualStartDate, endDate: actualEndDate };
    } else {
      // Use default: current year
      const now = new Date();
      const currentYear = now.getFullYear();
      actualStartDate = `${currentYear}-01-01 00:00:00`;
      actualEndDate = `${currentYear}-12-31 23:59:59`;
      dateFilter = "WHERE call_start BETWEEN :startDate AND :endDate";
      dateParams = { startDate: actualStartDate, endDate: actualEndDate };
    }

    // 1. Total Calls
    const totalCallsQuery = `
      SELECT COUNT(*) AS total
      FROM call_summary
      ${dateFilter}
    `;
    const totalCallsResult = await sequelize.query(totalCallsQuery, {
      replacements: dateParams,
      type: QueryTypes.SELECT,
    });
    const totalCalls = parseInt(totalCallsResult[0]?.total || 0);

    // 2. Answered Calls
    const answeredCallsQuery = `
      SELECT COUNT(*) AS total
      FROM call_summary
      ${dateFilter}
      AND cdr_status = 'ANSWERED'
    `;
    const answeredCallsResult = await sequelize.query(answeredCallsQuery, {
      replacements: dateParams,
      type: QueryTypes.SELECT,
    });
    const answeredCalls = parseInt(answeredCallsResult[0]?.total || 0);

    // 3. No Answered Calls
    const noAnsweredCallsQuery = `
      SELECT COUNT(*) AS total
      FROM call_summary
      ${dateFilter}
      AND cdr_status = 'NO ANSWER'
    `;
    const noAnsweredCallsResult = await sequelize.query(noAnsweredCallsQuery, {
      replacements: dateParams,
      type: QueryTypes.SELECT,
    });
    const noAnsweredCalls = parseInt(noAnsweredCallsResult[0]?.total || 0);

    // 4. Busy Calls
    const busyCallsQuery = `
      SELECT COUNT(*) AS total
      FROM call_summary
      ${dateFilter}
      AND cdr_status = 'BUSY'
    `;
    const busyCallsResult = await sequelize.query(busyCallsQuery, {
      replacements: dateParams,
      type: QueryTypes.SELECT,
    });
    const busyCalls = parseInt(busyCallsResult[0]?.total || 0);

    // 5. Call Trends - Daily
    const dailyTrendQuery = `
      SELECT 
        DATE(call_start) AS date,
        COUNT(*) AS count
      FROM call_summary
      ${dateFilter}
      GROUP BY DATE(call_start)
      ORDER BY date DESC
    `;
    const dailyTrend = await sequelize.query(dailyTrendQuery, {
      replacements: dateParams,
      type: QueryTypes.SELECT,
    });

    // 6. Call Trends - Monthly
    const monthlyTrendQuery = `
      SELECT 
        YEAR(call_start) AS year,
        MONTH(call_start) AS month,
        COUNT(*) AS count
      FROM call_summary
      ${dateFilter}
      GROUP BY YEAR(call_start), MONTH(call_start)
      ORDER BY year DESC, month DESC
    `;
    const monthlyTrend = await sequelize.query(monthlyTrendQuery, {
      replacements: dateParams,
      type: QueryTypes.SELECT,
    });

    // 7. Call Trends - Yearly
    const yearlyTrendQuery = `
      SELECT 
        YEAR(call_start) AS year,
        COUNT(*) AS count
      FROM call_summary
      ${dateFilter}
      GROUP BY YEAR(call_start)
      ORDER BY year DESC
    `;
    const yearlyTrend = await sequelize.query(yearlyTrendQuery, {
      replacements: dateParams,
      type: QueryTypes.SELECT,
    });

    // 8. Call Status Distribution - Yearly
    const statusDistributionQuery = `
      SELECT 
        YEAR(call_start) AS year,
        cdr_status AS status,
        COUNT(*) AS count
      FROM call_summary
      ${dateFilter}
      GROUP BY YEAR(call_start), cdr_status
      ORDER BY year DESC, cdr_status ASC
    `;
    const statusDistribution = await sequelize.query(statusDistributionQuery, {
      replacements: dateParams,
      type: QueryTypes.SELECT,
    });

    // Format response
    const response = {
      totalCalls,
      answeredCalls,
      noAnsweredCalls,
      busyCalls,
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
        yearly: statusDistribution.map((row) => ({
          year: parseInt(row.year || 0),
          status: row.status,
          count: parseInt(row.count || 0),
        })),
      },
      dateRange: {
        startDate: actualStartDate || null,
        endDate: actualEndDate || null,
      },
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  } catch (err) {
    console.error("Error retrieving call summary data:", err.message);
    res.status(500).json({
      error: "Internal Server Error",
      message: err.message,
    });
  }
};

module.exports = {
  getCallSummary,
};

