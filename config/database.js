const { Sequelize } = require("sequelize");
require("dotenv").config();
const config = require('./config');

const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

const sequelize = new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  {
    host: dbConfig.host,
    port: dbConfig.port,
    dialect: dbConfig.dialect,
    logging: dbConfig.logging
  }
);

sequelize
  .authenticate()
  .then(() => console.log("WCF database connected..."))
  .catch((err) => console.log("Error: " + err));

module.exports = sequelize;
