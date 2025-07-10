// require("dotenv").config();

// module.exports = {
//   development: {
//      username: process.env.DB_USER || "asterisk",
//     password: process.env.DB_PASS || "@Ttcl123",
//     database: process.env.DB_NAME || "asterisk",
//     host: process.env.DB_HOST || "10.52.0.19",
//     port: process.env.DB_PORT || 3306,
//     dialect: "mysql",
//     logging: false,
//   },
//   production: {
//     username: process.env.DB_USER || "asterisk",
//     password: process.env.DB_PASS || "@Ttcl123",
//     database: process.env.DB_NAME || "asterisk",
//     host: process.env.DB_HOST || "10.52.0.19",
//     port: process.env.DB_PORT || 3306,
//     dialect: "mysql",
//     logging: false,
//   },
// };


require("dotenv").config();

module.exports = {
  development: {
    username: process.env.DB_USER || "asterisk",
    password: process.env.DB_PASS || "Wcf@1234",
    database: process.env.DB_NAME || "asterisk",
    host: process.env.DB_HOST || "192.168.1.170",
    port: process.env.DB_PORT || 3306,
    dialect: "mysql",
    logging: false,
  },
  production: {
    username: process.env.DB_USER || "asterisk",
    password: process.env.DB_PASS || "Wcf@1234",
    database: process.env.DB_NAME || "asterisk",
    host: process.env.DB_HOST || "192.168.1.170",
    port: process.env.DB_PORT || 3306,
    dialect: "mysql",
    logging: false,
  },
};

