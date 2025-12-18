const { DataTypes } = require('sequelize');
const sequelize = require('../config/mysql_connection');

const TicketChartRead = sequelize.define('TicketChartRead', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  ticket_chart_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'TicketCharts',
      key: 'id'
    },
    comment: 'Reference to the ticket chart message that was read'
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    },
    comment: 'User who read the message'
  },
  read_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Timestamp when the message was read'
  }
}, {
  tableName: 'TicketChartReads',
  timestamps: true,
  createdAt: 'read_at',
  updatedAt: false,
  underscored: true,
  indexes: [
    { 
      name: 'idx_ticket_chart_read_chart_id', 
      fields: ['ticket_chart_id'] 
    },
    { 
      name: 'idx_ticket_chart_read_user_id', 
      fields: ['user_id'] 
    },
    {
      name: 'idx_ticket_chart_read_unique',
      unique: true,
      fields: ['ticket_chart_id', 'user_id'],
      comment: 'Ensure a user can only have one read record per message'
    }
  ]
});

// Define associations
TicketChartRead.associate = (models) => {
  TicketChartRead.belongsTo(models.TicketChart, { 
    foreignKey: 'ticket_chart_id', 
    as: 'ticketChart' 
  });
  TicketChartRead.belongsTo(models.User, { 
    foreignKey: 'user_id', 
    as: 'user' 
  });
};

module.exports = TicketChartRead;

