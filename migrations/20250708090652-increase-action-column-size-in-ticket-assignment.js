'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.changeColumn('Ticket_assignments', 'action', {
      type: Sequelize.STRING(200),
      allowNull: false
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.changeColumn('Ticket_assignments', 'action', {
      type: Sequelize.STRING(20),
      allowNull: false
    });
  }
};
