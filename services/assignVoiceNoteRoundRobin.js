const VoiceNote = require('../models/VoiceNote');
const User = require('../models/User');
const VoiceNoteAssignmentTracker = require('../models/VoiceNoteAssignmentTracker');

async function assignVoiceNoteRoundRobin(voiceNoteData) {
  const agents = await User.findAll({
    where: { role: 'agent'},
    order: [['createdAt', 'ASC']]
  });

  if (agents.length === 0) {
    throw new Error("No available agents.");
  }

  let tracker = await VoiceNoteAssignmentTracker.findByPk(1);
  if (!tracker) {
    tracker = await VoiceNoteAssignmentTracker.create({ id: 1, last_assigned_agent_id: null });
  }

  let nextAgentIndex = 0;

  if (tracker.last_assigned_agent_id) {
    const lastIndex = agents.findIndex(a => a.id === tracker.last_assigned_agent_id);
    nextAgentIndex = (lastIndex + 1) % agents.length;
  }

  const selectedAgent = agents[nextAgentIndex];

  const voiceNote = await VoiceNote.create({
    ...voiceNoteData,
    assigned_agent_id: selectedAgent.id
  });

  tracker.last_assigned_agent_id = selectedAgent.id;
  await tracker.save();

  return voiceNote;
}

module.exports = assignVoiceNoteRoundRobin;
