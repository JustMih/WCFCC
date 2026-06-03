require("dotenv").config();
const sequelize = require("../config/mysql_connection.js");

(async () => {
  const [rows] = await sequelize.query(
    `SELECT ticket_id, section, sub_section, responsible_unit_name, category
     FROM Tickets WHERE id = '193a9612-94d0-4108-a622-c66f9857f03f'`
  );
  console.log(rows[0]);
  await sequelize.close();
})();
