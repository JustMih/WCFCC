const { DataTypes } = require('sequelize');
const sequelize = require('../config/mysql_connection');

const VoiceNoteAssignmentTracker = sequelize.define('VoiceNoteAssignmentTracker', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true
  },
  last_assigned_agent_id: {
    type: DataTypes.CHAR(36),
    allowNull: true
  }
}, {
  tableName: 'voice_note_assignment_tracker',
  timestamps: false
});

module.exports = VoiceNoteAssignmentTracker;
