const { DataTypes } = require("sequelize");
const sequelize = require("../config/mysql_connection.js");

const Designation = sequelize.define(
  "Designation",
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    timestamps: true,
    tableName: "Designation",
  }
);

module.exports = Designation;
