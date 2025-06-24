const { DataTypes } = require('sequelize');
const sequelize = require('../config/mysql_connection');

const AssignedOfficer = sequelize.define('AssignedOfficer', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  first_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  middle_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  last_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  nida_number: {
    type: DataTypes.STRING,
    allowNull: true
  },
  phone_number: {
    type: DataTypes.STRING,
    allowNull: false
  },
  employer_id: {
    type: DataTypes.STRING,
    allowNull: true
  },
  assigned_to_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'Users',
      key: 'id'
    },
    onDelete: 'SET NULL'
  },
  status: {
    type: DataTypes.ENUM('Active', 'Reassigned', 'Completed'),
    defaultValue: 'Active',
    allowNull: false
  },
  reassignment_history: {
    type: DataTypes.JSON,
    allowNull: true
  },
  assigned_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false
  },
  completed_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'AssignedOfficers',
  timestamps: true
});

// Define associations
AssignedOfficer.associate = (models) => {
  AssignedOfficer.belongsTo(models.User, {
    foreignKey: 'assigned_to_id',
    as: 'assignedTo'
  });

  AssignedOfficer.hasMany(models.Ticket, {
    foreignKey: 'assigned_officer_id',
    as: 'tickets'
  });
};

module.exports = AssignedOfficer; 