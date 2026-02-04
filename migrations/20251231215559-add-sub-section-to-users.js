'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Users', 'sub_section', {
      type: Sequelize.STRING(100),
      allowNull: true,
      after: 'unit_section',
      comment: "The sub-section (function) within a directorate (e.g., 'Claims Processing', 'Compliance Review')"
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Users', 'sub_section');
  }
};
