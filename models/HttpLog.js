const { DataTypes } = require("sequelize");
const sequelize = require("../config/mysql_connection.js");

// Stores a single HTTP request/response log entry
const HttpLog = sequelize.define(
  "HttpLog",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    method: {
      type: DataTypes.STRING(10),
      allowNull: false,
    },
    path: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    fullUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    statusCode: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    durationMs: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    ip: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "User.id when available (no hard FK to keep logging robust)",
    },
    role: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    userAgent: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    requestId: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: "Optional correlation ID for tracing",
    },
  },
  {
    tableName: "HttpLogs",
    timestamps: true,
    indexes: [
      { fields: ["createdAt"] },
      { fields: ["method"] },
      { fields: ["statusCode"] },
    ],
  }
);

module.exports = HttpLog;

