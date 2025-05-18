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
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'unread'
  }
}, {
  tableName: 'Notifications',
  timestamps: true,
  underscored: true
});

Notification.name = 'Notification';

module.exports = Notification; 