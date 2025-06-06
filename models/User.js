const { DataTypes } = require("sequelize");
const sequelize = require("../config/mysql_connection.js");

const User = sequelize.define(
  "User",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    role: {
      type: DataTypes.ENUM(
        "super-admin",
        "admin",
        "supervisor",
        "agent",
        "attendee",
        "coordinator",
        "focal-person",
        "director-general",
        "directorate of operations",
        "directorate of assessment services",
        "directorate of finance, planning and investment",
        "legal unit",
        "ict unit",
        "actuarial statistics and risk management",
        "public relation unit",
        "procurement management unit",
        "human resource management and attachment unit"
      ),
      allowNull: false,
      defaultValue: "super-admin",
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "offline",
    },
    extension: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    timestamps: true,
    tableName: "Users", // Optional but helps if your table name is explicitly Users (plural)
  }
);

// Associations
User.associate = (models) => {
  User.hasMany(models.Ticket, {
    foreignKey: "userId", // ✅ Sequelize field in Ticket model
    as: "ticketsCreated",
  });
};

module.exports = User;
