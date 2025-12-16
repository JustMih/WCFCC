const { DataTypes } = require('sequelize');
const sequelize = require('../config/mysql_connection');

const TicketUpdateRead = sequelize.define('TicketUpdateRead', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  ticket_update_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'TicketUpdates',
      key: 'id'
    },
    comment: 'Reference to the ticket update that was read'
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    },
    comment: 'User who read the update'
  },
  read_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Timestamp when the update was read'
  }
}, {
  tableName: 'TicketUpdateReads',
  timestamps: true,
  createdAt: 'read_at',
  updatedAt: false,
  underscored: true,
  indexes: [
    { 
      name: 'idx_ticket_update_read_update_id', 
      fields: ['ticket_update_id'] 
    },
    { 
      name: 'idx_ticket_update_read_user_id', 
      fields: ['user_id'] 
    },
    {
      name: 'idx_ticket_update_read_unique',
      unique: true,
      fields: ['ticket_update_id', 'user_id'],
      comment: 'Ensure a user can only have one read record per update'
    }
  ]
});

// Define associations
TicketUpdateRead.associate = (models) => {
  TicketUpdateRead.belongsTo(models.TicketUpdate, { 
    foreignKey: 'ticket_update_id', 
    as: 'ticketUpdate' 
  });
  TicketUpdateRead.belongsTo(models.User, { 
    foreignKey: 'user_id', 
    as: 'user' 
  });
};

module.exports = TicketUpdateRead;

