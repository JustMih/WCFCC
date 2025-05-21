'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Tickets', 'responsible_unit_name', {
      type: Sequelize.STRING,
      allowNull: true, // Can be null if not required
    }, {
      after: 'ticket_id' // Adds the column after 'ticket_id'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Tickets', 'responsible_unit_name');
  }
};
