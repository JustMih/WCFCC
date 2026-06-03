require("dotenv").config();
const sequelize = require("../config/mysql_connection.js");

(async () => {
  const [rows] = await sequelize.query(
    `SELECT username, role, unit_section, sub_section, designation
     FROM Users
     WHERE role = 'head-of-unit' AND LOWER(unit_section) LIKE '%ict%'`
  );
  console.log(rows);
  await sequelize.close();
})();
