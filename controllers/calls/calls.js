const sequelize = require("../../config/mysql_connection");

// Controller to get data for different time frames (Total, Monthly, Weekly, Daily)
const getCdrCounts = async (req, res) => {
  try {
    // Log the current date for debugging
    console.log("Current Date: ", new Date().toISOString());

    // Total count for each disposition
    const totalCounts = await sequelize.query(
      "SELECT disposition, COUNT(*) AS count FROM cdr GROUP BY disposition"
    );

    // Monthly count for each disposition
    const monthlyCounts = await sequelize.query(
      "SELECT disposition, COUNT(*) AS count FROM cdr WHERE YEAR(cdrstarttime) = YEAR(CURDATE()) AND MONTH(cdrstarttime) = MONTH(CURDATE()) GROUP BY disposition"
    );
    console.log("Monthly Counts: ", monthlyCounts[0]);

    // Weekly count for each disposition
    const weeklyCounts = await sequelize.query(
      "SELECT disposition, COUNT(*) AS count FROM cdr WHERE YEAR(cdrstarttime) = YEAR(CURDATE()) AND WEEK(cdrstarttime, 1) = WEEK(CURDATE(), 1) GROUP BY disposition"
    );
    console.log("Weekly Counts: ", weeklyCounts[0]);

    // Daily count for each disposition
    const dailyCounts = await sequelize.query(
      "SELECT disposition, COUNT(*) AS count FROM cdr WHERE DATE(cdrstarttime) = CURDATE() GROUP BY disposition"
    );
    console.log("Daily Counts: ", dailyCounts[0]);

    // Total row count
    const totalRows = await sequelize.query(
      "SELECT COUNT(*) AS total FROM cdr"
    );

    // Send all the counts as a JSON response
    res.json({
      totalCounts: totalCounts[0],
      monthlyCounts: monthlyCounts[0],
      weeklyCounts: weeklyCounts[0],
      dailyCounts: dailyCounts[0],
      totalRows: totalRows[0][0].total, // Extract total count
    });
  } catch (err) {
    console.error("Error retrieving CDR data:", err.message);
    res.status(500).send("Internal Server Error");
  }
};

module.exports = { getCdrCounts };
