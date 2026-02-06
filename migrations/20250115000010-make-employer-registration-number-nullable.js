'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('Employers', 'registration_number', {
      type: Sequelize.STRING,
      allowNull: true,
      unique: false // Remove unique constraint since it can be null
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('Employers', 'registration_number', {
      type: Sequelize.STRING,
      allowNull: false,
      unique: true
    });
  }
};
