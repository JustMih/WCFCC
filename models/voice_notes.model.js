const { DataTypes } = require("sequelize");
const sequelize = require("../config/mysql_connection");

const VoiceNote = sequelize.define(
  "VoiceNote",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    recording_path: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    clid: {
      type: DataTypes.STRING(80),
      allowNull: false,
    },

    // ✅ THIS WAS MISSING (THE ROOT CAUSE)
    assigned_extension: {
      type: DataTypes.STRING(10),
      allowNull: true,
    },

    assigned_agent_id: {
      type: DataTypes.CHAR(36),
      allowNull: true,
    },

    is_played: {
      type: DataTypes.TINYINT,
      defaultValue: 0,
    },

    played_by: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },

    played_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    status: {
      type: DataTypes.ENUM("NEW", "LISTENED", "CLOSED"),
      defaultValue: "NEW",
    },

    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "Voice_Notes",
    timestamps: false,
  }
);

module.exports = VoiceNote;
