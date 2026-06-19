require("dotenv").config();
const sequelize = require("../config/mysql_connection");

const TICKET_ID = process.argv[2] || "WCF-CC-20260606-000007";

(async () => {
  try {
    const [rows] = await sequelize.query(
      `SELECT ticket_id, first_name, middle_name, last_name, representative_name,
              institution, employer_id, requester, phone_number, nida_number,
              subject, category, status, created_at
       FROM Tickets
       WHERE ticket_id = ?
       LIMIT 1`,
      { replacements: [TICKET_ID] }
    );

    if (!rows.length) {
      console.log("No ticket found for:", TICKET_ID);
      return;
    }

    const ticket = rows[0];
    console.log("=== Raw DB values ===");
    console.log(JSON.stringify(ticket, null, 2));

    if (ticket.employer_id) {
      const [emp] = await sequelize.query(
        "SELECT id, name FROM Employers WHERE id = ? LIMIT 1",
        { replacements: [ticket.employer_id] }
      );
      console.log("\n=== Linked Employer record ===");
      console.log(JSON.stringify(emp[0] || null, null, 2));
    }

    console.log("\n=== Which field has the name? ===");
    const fields = [
      "first_name",
      "middle_name",
      "last_name",
      "representative_name",
      "institution",
    ];
    for (const f of fields) {
      const v = ticket[f];
      console.log(
        `${f}: ${v === null || v === undefined || String(v).trim() === "" ? "(empty)" : JSON.stringify(v)}`
      );
    }
  } catch (e) {
    console.error("Error:", e.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
})();
