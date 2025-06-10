const { DataTypes } = require('sequelize');
const sequelize = require("../config/mysql_connection");

const VoiceNote = sequelize.define('VoiceNote', {
  id: {
    type: DataTypes.BIGINT.UNSIGNED,
    primaryKey: true,
    autoIncrement: true,
  },
  recording_path: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  clid: {
    type: DataTypes.STRING(80),
    allowNull: false,
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'Voice_Notes',
  timestamps: false,
});

module.exports = VoiceNote;
