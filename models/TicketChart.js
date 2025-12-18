const { DataTypes } = require('sequelize');
const sequelize = require('../config/mysql_connection');

const TicketChart = sequelize.define('TicketChart', {
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
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'TicketCharts',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  underscored: true,
  indexes: [
    { name: 'idx_ticket_chart_ticket_id', fields: ['ticket_id'] },
    { name: 'idx_ticket_chart_user_id', fields: ['user_id'] },
    { name: 'idx_ticket_chart_created_at', fields: ['created_at'] }
  ]
});

// Define associations
TicketChart.associate = (models) => {
  TicketChart.belongsTo(models.Ticket, { foreignKey: 'ticket_id', as: 'ticket' });
  TicketChart.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
};

module.exports = TicketChart;

