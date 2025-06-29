const { DataTypes } = require('sequelize');
const sequelize = require('../config/mysql_connection');

const TicketAssignment = sequelize.define('TicketAssignment', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  ticket_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  assigned_by_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  assigned_to_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  assigned_to_role: {
    type: DataTypes.STRING,
    allowNull: false
  },
  action: {
    type: DataTypes.STRING,
    allowNull: false
  },
  reason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'Ticket_assignments',
  timestamps: false
});

TicketAssignment.associate = (models) => {
  TicketAssignment.belongsTo(models.Ticket, { foreignKey: 'ticket_id', as: 'ticket' });
  TicketAssignment.belongsTo(models.User, { as: 'assignee', foreignKey: 'assigned_to_id' });
};

module.exports = TicketAssignment; 