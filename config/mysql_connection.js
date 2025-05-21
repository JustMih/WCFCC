const { Sequelize } = require("sequelize");
require("dotenv").config();


const sequelize = new Sequelize(
  process.env.DB_NAME || "wcf_db",
  process.env.DB_USER || "root",
  process.env.DB_PASS || "",
  {
    host: process.env.DB_HOST || "127.0.0.1",
    port: process.env.DB_PORT || 3306,
    dialect: "mysql",
    logging: false,
    dialectOptions: {
      connectTimeout: 10000, // Prevents timeout issues
    },
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
);

sequelize
  .authenticate()
  .then(() => {
    console.log("Connected to the live MySQL database...");
  })
  .catch((err) => {
    console.error("MySQL Connection Error:", err);
    // Don't exit the process, just log the error
  });

module.exports = sequelize;
