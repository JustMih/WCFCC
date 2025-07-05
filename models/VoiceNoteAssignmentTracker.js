const { DataTypes } = require('sequelize');
const sequelize = require('../config/mysql_connection');

const VoiceNoteAssignmentTracker = sequelize.define('VoiceNoteAssignmentTracker', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true, // Add this if `id` is auto-incremented in the DB
    allowNull: false
  },
  last_assigned_agent_id: {
    type: DataTypes.STRING(36), // STRING is generally preferred over CHAR in Sequelize unless CHAR is required
    allowNull: true
  }
}, {
  tableName: 'voice_note_assignment_tracker',
  timestamps: false
});

module.exports = VoiceNoteAssignmentTracker;
