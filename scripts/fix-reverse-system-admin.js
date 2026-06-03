require("dotenv").config();
const sequelize = require("../config/mysql_connection.js");

const ticketNumber = process.argv[2] || "WCF-CC-20260530-000005";

(async () => {
  const [tickets] = await sequelize.query(
    `SELECT id FROM Tickets WHERE ticket_id = ? LIMIT 1`,
    { replacements: [ticketNumber] }
  );
  if (!tickets[0]) {
    console.error("Ticket not found:", ticketNumber);
    process.exit(1);
  }
  const ticketId = tickets[0].id;

  const [removed] = await sequelize.query(
    `DELETE ta FROM Ticket_assignments ta
     JOIN Users u ON ta.assigned_to_id = u.id
     WHERE ta.ticket_id = ? AND ta.action = 'Reversed' AND u.username = 'system'`,
    { replacements: [ticketId] }
  );

  const [[dg]] = await sequelize.query(
    `SELECT assigned_to_id, assigned_to_role FROM Ticket_assignments
     WHERE ticket_id = ? AND action = 'Escalated'
     ORDER BY created_at DESC LIMIT 1`,
    { replacements: [ticketId] }
  );

  if (dg) {
    await sequelize.query(
      `UPDATE Tickets SET assigned_to_id = ?, assigned_to_role = ?, status = 'Assigned', is_escalated = 1 WHERE id = ?`,
      { replacements: [dg.assigned_to_id, dg.assigned_to_role, ticketId] }
    );
  }

  const [history] = await sequelize.query(
    `SELECT ta.action, u.full_name, u.username
     FROM Ticket_assignments ta
     LEFT JOIN Users u ON ta.assigned_to_id = u.id
     WHERE ta.ticket_id = ?
     ORDER BY ta.created_at ASC`,
    { replacements: [ticketId] }
  );

  console.log("Deleted Reversed→system rows:", removed.affectedRows ?? removed);
  console.log("Restored to DG:", dg);
  console.log("History now:", history);
  await sequelize.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
