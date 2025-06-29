require("dotenv").config();

module.exports = {
  development: {
    username: process.env.DB_USER || "root",
    password: process.env.DB_PASS || "",
    database: process.env.DB_NAME || "wcf_db",
    host: process.env.DB_HOST || "127.0.0.1",
    //  username: process.env.DB_USER || "asterisk",
    // password: process.env.DB_PASS || "@Ttcl123",
    // database: process.env.DB_NAME || "asterisk",
    // host: process.env.DB_HOST || "10.52.0.19",
    port: process.env.DB_PORT || 3306,
    port: process.env.DB_PORT || 3306,
    dialect: "mysql",
    logging: false,
  },
  production: {
    username: process.env.DB_USER || "asterisk",
    password: process.env.DB_PASS || "@Ttcl123",
    database: process.env.DB_NAME || "asterisk",
    host: process.env.DB_HOST || "10.52.0.19",
    port: process.env.DB_PORT || 3306,
    dialect: "mysql",
    logging: false,
  },
};
