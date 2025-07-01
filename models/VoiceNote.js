const { DataTypes } = require("sequelize");
const sequelize = require("../config/mysql_connection");

const VoiceNote = sequelize.define("Voice_Notes", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  recording_path: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  clid: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  assigned_agent_id: {
    type: DataTypes.CHAR(36),
    allowNull: true
  },
  is_played: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  duration_seconds: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  transcription: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: "Voice_Notes",
  timestamps: false,  // Disable Sequelize automatic timestamps
});

module.exports = VoiceNote;
