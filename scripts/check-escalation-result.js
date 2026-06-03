require("dotenv").config();
const sequelize = require("../config/mysql_connection.js");

(async () => {
  const [rows] = await sequelize.query(
    `SELECT ta.action, ta.assigned_to_role, ta.reason, ta.created_at, u.full_name
     FROM Ticket_assignments ta
     JOIN Users u ON u.id = ta.assigned_to_id
     WHERE ta.ticket_id = '193a9612-94d0-4108-a622-c66f9857f03f'
     ORDER BY ta.created_at DESC
     LIMIT 3`
  );
  console.log(rows);
  await sequelize.close();
})();
