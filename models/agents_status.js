const { DataTypes } = require("sequelize");
const sequelize = require("../config/mysql_connection.js");

const AgentStatus = sequelize.define(
  "AgentStatus",
  {
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "Users", // Make sure this matches the name of your User model
        key: "id",
      },
    },
    status: {
      type: DataTypes.ENUM("online", "offline"),
      defaultValue: "offline",
    },
    loginTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    logoutTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    totalOnlineTime: {
      type: DataTypes.INTEGER, // Store total time in seconds
      defaultValue: 0,
    },
  },
  { timestamps: true }
);

module.exports = AgentStatus;
