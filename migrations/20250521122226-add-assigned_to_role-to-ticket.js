'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Tickets', 'assigned_to_role', {
      type: Sequelize.STRING, // You can change the type based on your needs
      allowNull: true,        // Set to false if the column must have a value
    }, {
      after: 'responsible_unit_name'  // Ensure the column is added after 'responsible_unit_name'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Tickets', 'assigned_to_role');
  }
};
