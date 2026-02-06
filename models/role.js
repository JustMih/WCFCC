const { DataTypes } = require("sequelize");
const sequelize = require("../config/mysql_connection.js");

const Role = sequelize.define(
  "Role",
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    report_to: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    designation: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    unit_section: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: "The specific unit/directorate this role belongs to"
    },
    role: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
  },
  {
    timestamps: true,
    tableName: "Roles",
  }
);

module.exports = Role; 