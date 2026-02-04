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
      // Explicitly prevent Sequelize from looking for report_to_id foreign key
      field: "report_to", // Explicitly map to the database column name
      // Explicitly tell Sequelize this is NOT a foreign key
      references: undefined,
    },
    designation: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    unit_section: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment:
        "The specific unit/directorate this user belongs to (e.g., 'directorate of operations', 'ict unit')",
    },
    sub_section: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment:
        "The sub-section (function) within a directorate (e.g., 'Pension Payment', 'Workplace Risk Assessment Matters')",
    },
  },
  {
    timestamps: true,
    tableName: "Users", // Optional but helps if your table name is explicitly Users (plural)
    // Prevent Sequelize from auto-detecting foreign keys
    freezeTableName: true,
    // Disable automatic timestamp fields if not needed (already have timestamps: true)
    // Explicitly tell Sequelize not to auto-detect associations
    underscored: false,
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
