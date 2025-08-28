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
    full_name: {
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
        "reviewer",
        "focal-person",
        "claim-focal-person",
        "compliance-focal-person",
        "head-of-unit",
        "director",
        "manager",
        "director-general"
      ),
      allowNull: false,
      defaultValue: "agent",
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
    username: {
      type: DataTypes.STRING(100),
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
      comment: "The specific unit/directorate this user belongs to (e.g., 'directorate of operations', 'ict unit')"
    }
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

  User.hasMany(models.TicketAssignment, {
    as: "assignments",
    foreignKey: "assigned_to_id",
  });
  // User can be the assignee of many Tickets
  User.hasMany(models.Ticket, {
    as: "assignedTickets",
    foreignKey: "assigned_to_id",
  });

  User.hasMany(models.TicketUpdate, {
    as: "ticketUpdates",
    foreignKey: "user_id",
  });
};

module.exports = User;
