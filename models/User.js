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
        "coordinator",
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
    report_to_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "ReportTo",
        key: "id",
      },
    },
    designation_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "Designation",
        key: "id",
      },
    },
    unit_section_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "UnitSection",
        key: "id",
      },
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

  User.hasMany(models.TicketAssignment, {
    as: "assignments",
    foreignKey: "assigned_to_id",
  });
  // User can be the assignee of many Tickets
  User.hasMany(models.Ticket, {
    as: "assignedTickets",
    foreignKey: "assigned_to_id",
  });

  // New associations for the lookup tables
  User.belongsTo(models.ReportTo, {
    foreignKey: "report_to_id",
    as: "reportTo",
  });

  User.belongsTo(models.Designation, {
    foreignKey: "designation_id",
    as: "designation",
  });

  User.belongsTo(models.UnitSection, {
    foreignKey: "unit_section_id",
    as: "unitSection",
  });

  // Many-to-many relationship with roles
  User.belongsToMany(models.NewRole, {
    through: models.UserRole,
    foreignKey: "userId",
    otherKey: "roleId",
    as: "roles",
  });
};

module.exports = User;
