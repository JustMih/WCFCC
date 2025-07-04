const { DataTypes } = require('sequelize');
const sequelize = require('../config/mysql_connection');

const Notification = sequelize.define('Notification', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  ticket_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  sender_id: {
    type: DataTypes.UUID,
    allowNull: true
  },
  recipient_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  channel: {
    type: DataTypes.STRING,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('read', 'unread'),
    allowNull: false,
    defaultValue: 'unread'
  },
  comment: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'Notifications',
  timestamps: true,
  underscored: true
});

Notification.name = 'Notification';

// Add association
Notification.associate = (models) => {
  Notification.belongsTo(models.Ticket, {
    foreignKey: 'ticket_id',
    as: 'ticket'
  });
  Notification.belongsTo(models.User, {
    foreignKey: 'sender_id',
    as: 'sender'
  });
  Notification.belongsTo(models.User, {
    foreignKey: 'recipient_id',
    as: 'recipient'
  });
};

module.exports = Notification; 