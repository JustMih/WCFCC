'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('voice_note_assignment_tracker', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true
      },
      last_assigned_agent_id: {
        type: Sequelize.CHAR(36),
        allowNull: true
      }
    });

    // Insert initial tracker row
    await queryInterface.bulkInsert('voice_note_assignment_tracker', [{
      id: 1,
      last_assigned_agent_id: null
    }]);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('voice_note_assignment_tracker');
  }
};
