'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Tickets', 'employer_registration_number', {
      type: Sequelize.STRING(100),
      allowNull: true,
      comment: 'Employer registration number saved on ticket creation (for MAC redirect and display)',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('Tickets', 'employer_registration_number');
  },
};

