'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Simply alter the existing column to change type from TEXT to STRING(1000)
    await queryInterface.changeColumn('Tickets', 'dependents', {
      type: Sequelize.STRING(1000),
      allowNull: true,
      comment: 'Comma-separated list of dependent names (max 1000 chars)'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Revert back to TEXT type
    await queryInterface.changeColumn('Tickets', 'dependents', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Comma-separated list of dependent names'
    });
  }
}; 