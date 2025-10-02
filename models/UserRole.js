const { DataTypes } = require("sequelize");
const sequelize = require("../config/mysql_connection.js");

const UserRole = sequelize.define(
  "UserRole",
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "Users",
        key: "id",
      },
    },
    roleId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "Role",
        key: "id",
      },
    },
  },
  {
    timestamps: true,
    tableName: "UserRoles",
  }
);

module.exports = UserRole;
