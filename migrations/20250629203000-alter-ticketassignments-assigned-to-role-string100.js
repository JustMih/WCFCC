'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('Tickets', 'assigned_to_role', {
      type: Sequelize.STRING(200),
      allowNull: true, // or false if you want to enforce not null
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('Tickets', 'assigned_to_role', {
      type: Sequelize.STRING, // revert to default length
      allowNull: true,
    });
  }
}; 