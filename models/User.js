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
      field: "isActive", // Explicitly map to camelCase column name in database
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
    underscored: false, // Disable underscored for User model (has mixed naming: camelCase and snake_case)
    // createdAt and updatedAt will use camelCase (createdAt, updatedAt) instead of snake_case
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

  // Foreign key associations
  if (models.ReportTo) {
    User.belongsTo(models.ReportTo, {
      foreignKey: "report_to_id",
      as: "reportTo",
    });
  }

  if (models.Designation) {
    User.belongsTo(models.Designation, {
      foreignKey: "designation_id",
      as: "designation",
    });
  }

  if (models.UnitSection) {
    User.belongsTo(models.UnitSection, {
      foreignKey: "unit_section_id",
      as: "unitSection",
    });
  }
};

module.exports = User;
