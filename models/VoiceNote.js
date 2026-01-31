const { DataTypes } = require("sequelize");
const sequelize = require("../config/mysql_connection");

const VoiceNote = sequelize.define("VoiceNote", {
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

  assigned_extension: {
    type: DataTypes.STRING(10),
    allowNull: true,
  },

  assigned_agent_id: {
    type: DataTypes.CHAR(36),
    allowNull: true,
  },

  is_played: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },

  duration_seconds: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },

  transcription: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  status: {
    type: DataTypes.ENUM("NEW", "LISTENED", "CLOSED"),
    defaultValue: "NEW",
  },

  played_by: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },

  played_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },

  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: "Voice_Notes",
  timestamps: false,
});

module.exports = VoiceNote;
