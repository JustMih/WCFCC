const { DataTypes } = require("sequelize");
const sequelize = require("../config/mysql_connection");

const UserHandover = sequelize.define(
  "UserHandover",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    from_user_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    to_user_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    from_user_role: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    to_user_role: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    start_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    return_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("active", "revoked", "expired"),
      allowNull: false,
      defaultValue: "active",
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    revoked_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    revoked_by_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
  },
  {
    tableName: "UserHandovers",
    timestamps: true,
  }
);

UserHandover.associate = (models) => {
  UserHandover.belongsTo(models.User, {
    as: "fromUser",
    foreignKey: "from_user_id",
  });
  UserHandover.belongsTo(models.User, {
    as: "toUser",
    foreignKey: "to_user_id",
  });
  UserHandover.belongsTo(models.User, {
    as: "revokedBy",
    foreignKey: "revoked_by_id",
  });
  UserHandover.hasMany(models.Ticket, {
    as: "tickets",
    foreignKey: "handover_id",
  });
};

module.exports = UserHandover;
