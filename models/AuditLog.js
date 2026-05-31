const { DataTypes } = require("sequelize");
const sequelize = require("../config/mysql_connection.js");

const AuditLog = sequelize.define(
  "AuditLog",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    category: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: "api",
    },
    action: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    entityType: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    entityId: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "success",
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Actor User.id when available",
    },
    actorName: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    actorEmail: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    role: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    method: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },
    path: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    requestId: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    ip: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    userAgent: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    beforeState: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    afterState: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    tableName: "AuditLogs",
    timestamps: true,
    indexes: [
      { fields: ["createdAt"] },
      { fields: ["category"] },
      { fields: ["action"] },
      { fields: ["status"] },
      { fields: ["userId"] },
      { fields: ["requestId"] },
      { fields: ["entityType", "entityId"] },
    ],
  }
);

AuditLog.associate = (models) => {
  AuditLog.belongsTo(models.User, {
    foreignKey: "userId",
    as: "actor",
    constraints: false,
  });
};

module.exports = AuditLog;
