'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('Tickets', 'claim_number', {
      type: Sequelize.STRING(100),
      allowNull: true,
      comment: 'Claim number associated with the ticket (from selected/active claim)'
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('Tickets', 'claim_number');
  }
};
