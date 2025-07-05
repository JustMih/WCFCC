// const VoiceNote = require('../models/VoiceNote');
const User = require('../models/User');
const VoiceNoteAssignmentTracker = require('../models/VoiceNoteAssignmentTracker');
const sequelize = require('../config/mysql_connection'); // Ensure Sequelize instance is available

async function assignVoiceNoteRoundRobin(voiceNoteData) {
  const transaction = await sequelize.transaction();

  try {
    const agents = await User.findAll({
      where: { role: 'agent' },
      order: [['createdAt', 'ASC']],
      transaction
    });

    if (agents.length === 0) {
      throw new Error("No available agents.");
    }

    let tracker = await VoiceNoteAssignmentTracker.findByPk(1, { transaction });
    if (!tracker) {
      tracker = await VoiceNoteAssignmentTracker.create(
        { id: 1, last_assigned_agent_id: null },
        { transaction }
      );
    }

    let nextAgentIndex = 0;

    if (tracker.last_assigned_agent_id) {
      const lastIndex = agents.findIndex(
        a => a.id.toString() === tracker.last_assigned_agent_id.toString()
      );
      nextAgentIndex = (lastIndex + 1) % agents.length;
    }

    const selectedAgent = agents[nextAgentIndex];

    const voiceNote = await VoiceNote.create({
      ...voiceNoteData,
      assigned_agent_id: selectedAgent.id
    }, { transaction });

    tracker.last_assigned_agent_id = selectedAgent.id;
    await tracker.save({ transaction });

    await transaction.commit();
    return voiceNote;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

module.exports = assignVoiceNoteRoundRobin;
