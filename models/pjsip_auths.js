const { DataTypes } = require("sequelize");
const sequelize = require("../config/mysql_connection.js");

const PjsipAuths = sequelize.define(
  "pjsip_auths",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
      // autoIncrement: true,
    },
    auth_type: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "userpass",
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  // { timestamps: true }
);

module.exports = PjsipAuths;
