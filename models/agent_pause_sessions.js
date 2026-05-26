const { DataTypes } = require("sequelize");
const sequelize = require("../config/mysql_connection.js");
const User = require("./User");

const AgentPauseSession = sequelize.define(
  "AgentPauseSession",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "Users", key: "id" },
    },
    pause_activity: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    started_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    allowed_seconds: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    ended_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    exceeded_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    duration_seconds: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    exceeded_seconds: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: "AgentPauseSessions",
    timestamps: true,
  }
);

User.hasMany(AgentPauseSession, { foreignKey: "userId", as: "pauseSessions" });
AgentPauseSession.belongsTo(User, { foreignKey: "userId", as: "user" });

module.exports = AgentPauseSession;
