const { DataTypes } = require('sequelize');
const sequelize = require('../config/mysql_connection');

const InstagramComment = sequelize.define('InstagramComment', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  media_id: DataTypes.STRING,
  parent_id: DataTypes.STRING,
  text: DataTypes.TEXT,
  from_id: DataTypes.STRING,
  from_username: DataTypes.STRING,
  raw_payload: DataTypes.JSON,
  replied: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  replied_by: {
    type: DataTypes.STRING, // or UUID if you link with user table
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
  unread: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  read: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  replied: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  }
}, {
  tableName: 'instagram_comments',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

module.exports = InstagramComment;