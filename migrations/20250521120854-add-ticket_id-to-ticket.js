'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Tickets', 'ticket_id', {
      type: Sequelize.STRING,
      allowNull: false,
      unique: true, // Optionally make it unique
    }, {
      after: 'id' // This ensures that the column is added after 'id'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Tickets', 'ticket_id');
  }
};
