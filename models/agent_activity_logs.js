const { DataTypes } = require("sequelize");
const sequelize = require("../config/mysql_connection.js");
const User = require("./User");

const AgentLoginLog = sequelize.define(
  "AgentLoginLog",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User,
        key: "id",
      },
      onDelete: "CASCADE",
    },
    role: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    loginTime: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    logoutTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    totalOnlineTime: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0, // Time in seconds
    },
  },
  {
    sequelize,
    modelName: "AgentLoginLog",
    tableName: "AgentLoginLog",
    timestamps: true,
  }
);

User.hasOne(AgentLoginLog, { foreignKey: "userId", onDelete: "CASCADE" });
AgentLoginLog.belongsTo(User, { foreignKey: "userId", onDelete: "CASCADE" });

module.exports = AgentLoginLog;
