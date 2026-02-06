'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Tickets', 'dependents', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Comma-separated list of dependent names'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Tickets', 'dependents');
  }
}; 