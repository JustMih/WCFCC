// const { Sequelize } = require("sequelize");
// require("dotenv").config();
// const sequelize = new Sequelize(
//   process.env.DB_NAME || "asterisk",
//   process.env.DB_USER || "asterisk",
//   process.env.DB_PASS || "@Ttcl123",
//   {
//     host: process.env.DB_HOST || "10.52.0.19",
//     port: process.env.DB_PORT || 3306,
//     dialect: "mysql",
//     logging: false,
//     dialectOptions: { connectTimeout: 10000 },
//   }
// );

// sequelize
//   .authenticate()
//   .then(() => console.log("Connected to the live MySQL database..."))
//   .catch((err) => console.error("MySQL Connection Error:", err));

// module.exports = sequelize;

// const { Sequelize } = require("sequelize");
// require("dotenv").config();

// const sequelize = new Sequelize(
//   process.env.DB_NAME || "asterisk",
//   process.env.DB_USER || "asterisk",
//   process.env.DB_PASS || "@Ttcl123",
//   {
//     host: process.env.DB_HOST || "10.52.0.19",
//     port: process.env.DB_PORT || 3306,
//     dialect: "mysql",
//     logging: false,
//     dialectOptions: { connectTimeout: 10000 },
//   }
// );

// sequelize
//   .authenticate()
//   .then(() => console.log("Connected to the live MySQL database..."))
//   .catch((err) => console.error("MySQL Connection Error:", err));

// module.exports = sequelize;

const { Sequelize } = require("sequelize");
require("dotenv").config();

// const dbName = process.env.DB_NAME || "asterisk";
// const dbUser = process.env.DB_USER || "asterisk";
// const dbPass = process.env.DB_PASS || "Wcf@1234";
// const dbHost = process.env.DB_HOST || "192.168.21.70";
// const dbPort = process.env.DB_PORT || 3306;

const dbName = process.env.DB_NAME || "asterisk";
const dbUser = process.env.DB_USER || "asterisk";
const dbPass = process.env.DB_PASS || "@Ttcl123";
const dbHost = process.env.DB_HOST || "10.52.0.19";
const dbPort = process.env.DB_PORT || 3306;

const sequelize = new Sequelize(
  dbName,
  dbUser,
  dbPass,
  {
    host: dbHost,
    port: dbPort,
    dialect: "mysql",
    logging: false,
    timezone: '+03:00',   
    dialectOptions: { connectTimeout: 10000 },
  }
);

sequelize
  .authenticate()
  .then(() => console.log("Connected to the live MySQL database..."))
  .catch((err) => {
    console.error(
      `MySQL Connection Error (host=${dbHost}:${dbPort}, db=${dbName}, user=${dbUser}):`,
      err?.message || err
    );
  });

module.exports = sequelize;
