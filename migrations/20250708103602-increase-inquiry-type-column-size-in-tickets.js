'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.changeColumn('Tickets', 'inquiry_type', {
      type: Sequelize.STRING(100),
      allowNull: true
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.changeColumn('Tickets', 'inquiry_type', {
      type: Sequelize.STRING(20),
      allowNull: true
    });
  }
};
