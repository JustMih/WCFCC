'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Users', 'username', {
      type: Sequelize.STRING(100),
      allowNull: true,
      after: 'name'
    });
    await queryInterface.addColumn('Users', 'unit_section', {
      type: Sequelize.STRING(100),
      allowNull: true,
      after: 'username'
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Users', 'username');
    await queryInterface.removeColumn('Users', 'unit_section');
  }
}; 