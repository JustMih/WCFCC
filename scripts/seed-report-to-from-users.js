/**
 * Seed ReportTo lookup from distinct Users.report_to values.
 * Usage: node scripts/seed-report-to-from-users.js
 */
require("dotenv").config();
const { Op } = require("sequelize");
const sequelize = require("../config/mysql_connection");
const ReportTo = require("../models/ReportTo");
const User = require("../models/User");

(async () => {
  try {
    await sequelize.authenticate();

    const users = await User.findAll({
      attributes: ["report_to"],
      where: {
        report_to: {
          [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }],
        },
      },
      raw: true,
    });

    const names = [
      ...new Set(
        users
          .map((u) => String(u.report_to || "").trim())
          .filter(Boolean)
      ),
    ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

    let inserted = 0;
    let skipped = 0;

    for (const name of names) {
      const [, created] = await ReportTo.findOrCreate({
        where: { name },
        defaults: { name, description: "Seeded from Users.report_to" },
      });
      if (created) inserted += 1;
      else skipped += 1;
    }

    console.log(
      `Seed complete: ${inserted} inserted, ${skipped} already present, ${names.length} distinct user values.`
    );
    process.exit(0);
  } catch (error) {
    console.error("seed-report-to-from-users failed:", error.message);
    process.exit(1);
  }
})();
