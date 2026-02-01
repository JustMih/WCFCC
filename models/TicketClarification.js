const { DataTypes } = require('sequelize');
const sequelize = require('../config/mysql_connection');

const TicketClarification = sequelize.define('TicketClarification', {
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
  edited_by_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  edited_by_name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  edited_by_role: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  edited_by_email: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  clarification_text: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'Ticket_clarifications',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['ticket_id', 'edited_by_id', 'edited_by_role'],
      name: 'unique_ticket_user_role_clarification'
    }
  ]
});

TicketClarification.associate = (models) => {
  TicketClarification.belongsTo(models.Ticket, { foreignKey: 'ticket_id', as: 'ticket' });
  TicketClarification.belongsTo(models.User, { foreignKey: 'edited_by_id', as: 'editedBy' });
};

module.exports = TicketClarification;
