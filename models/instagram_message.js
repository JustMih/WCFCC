const { DataTypes } = require('sequelize');
const sequelize = require('../config/mysql_connection');

const InstagramMessage = sequelize.define('InstagramMessage', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
  },
  sender_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  sender_username: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  text: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  message_type: {
    type: DataTypes.ENUM('text', 'image', 'video', 'audio', 'file'),
    defaultValue: 'text',
    allowNull: false,
  },
  media_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  raw_payload: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  // Status tracking
  unread: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  read: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  read_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  read_by: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  // Reply tracking
  replied: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  replied_by: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  replied_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  reply: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: 'instagram_messages',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = InstagramMessage;
