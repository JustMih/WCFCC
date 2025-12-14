const { Sequelize } = require("sequelize");
require("dotenv").config();
const sequelize = new Sequelize(
  process.env.DB_NAME || "asterisk",
  process.env.DB_USER || "asterisk",
  process.env.DB_PASS || "@Ttcl123",
  {
    host: process.env.DB_HOST || "10.52.0.19",
    port: process.env.DB_PORT || 3306,
    dialect: "mysql",
    logging: false,
    define: {
      underscored: true,
      timestamps: true,
    },
    dialectOptions: {
      connectTimeout: 60000, // Increased to 60 seconds
    },
    pool: {
      max: 5,
      min: 0,
      acquire: 60000,
      idle: 10000,
    },
    retry: {
      max: 3,
    },
  }
);

sequelize
  .authenticate()
  .then(() => console.log("Connected to the live MySQL database..."))
  .catch((err) => console.error("MySQL Connection Error:", err));

module.exports = sequelize;
