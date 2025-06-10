'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Check if the column exists first
    const tableInfo = await queryInterface.describeTable('Tickets');
    if (!tableInfo.ticket_id) {
      await queryInterface.addColumn('Tickets', 'ticket_id', {
        type: Sequelize.STRING,
        allowNull: true,
        after: 'id'
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    // Check if the column exists before removing
    const tableInfo = await queryInterface.describeTable('Tickets');
    if (tableInfo.ticket_id) {
      await queryInterface.removeColumn('Tickets', 'ticket_id');
    }
  }
}; 