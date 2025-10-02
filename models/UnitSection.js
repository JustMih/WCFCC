const { DataTypes } = require("sequelize");
const sequelize = require("../config/mysql_connection.js");

const UnitSection = sequelize.define(
  "UnitSection",
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
    tableName: "UnitSection",
  }
);

module.exports = UnitSection;
