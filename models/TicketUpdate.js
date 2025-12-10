const { DataTypes } = require('sequelize');
const sequelize = require('../config_wcf/mysql_connection');

const TicketUpdate = sequelize.define('TicketUpdate', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  ticket_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Tickets',
      key: 'id'
    }
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  user_name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  user_role: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  update_text: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  update_date: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'Whether this user can still add updates (false when ticket is attended/closed)'
  },
  assignment_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'TicketAssignments',
      key: 'id'
    },
    comment: 'Reference to the assignment when this update was made'
  }
}, {
  tableName: 'TicketUpdates',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  underscored: true,
  indexes: [
    { name: 'idx_ticket_update_ticket_id', fields: ['ticket_id'] },
    { name: 'idx_ticket_update_user_id', fields: ['user_id'] },
    { name: 'idx_ticket_update_date', fields: ['update_date'] },
    { name: 'idx_ticket_update_active', fields: ['is_active'] }
  ]
});

// Define associations
TicketUpdate.associate = (models) => {
  TicketUpdate.belongsTo(models.Ticket, { foreignKey: 'ticket_id', as: 'ticket' });
  TicketUpdate.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  TicketUpdate.belongsTo(models.TicketAssignment, { foreignKey: 'assignment_id', as: 'assignment' });
};

module.exports = TicketUpdate;
