
require("dotenv").config();

module.exports = {
<<<<<<< HEAD
  // development: {
  //   username: process.env.DB_USER || "asterisk",
  //   password: process.env.DB_PASS || "@Ttcl123",
  //   database: process.env.DB_NAME || "asterisk",
  //   host: process.env.DB_HOST || "10.52.0.19",
  //   port: process.env.DB_PORT || 3306,
  //   dialect: "mysql",
  //   logging: false,
  // },
=======
  development: {
    username: process.env.DB_USER || "asterisk",
    password: process.env.DB_PASS || "Wcf@1234",
    database: process.env.DB_NAME || "asterisk",
    host: process.env.DB_HOST || "192.168.21.70",
    port: process.env.DB_PORT || 3306,
    dialect: "mysql",
    logging: false,
  },
>>>>>>> 3f323cc61538eecc27eb14408112a8e9f560dee7
  production: {
    username: process.env.DB_USER || "asterisk",
    password: process.env.DB_PASS || "Wcf@1234",
    database: process.env.DB_NAME || "asterisk",
    host: process.env.DB_HOST || "192.168.21.70",
    port: process.env.DB_PORT || 3306,
    dialect: "mysql",
    logging: false,
  },
};

