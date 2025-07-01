'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('Tickets', 'attachment_path', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'Path to the attachment file for ticket resolution'
    });

    await queryInterface.addColumn('Tickets', 'resolution_type', {
      type: Sequelize.ENUM('Resolved', 'Not Applicable', 'Duplicate', 'Referred'),
      allowNull: true,
      comment: 'Type of resolution when ticket is closed'
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('Tickets', 'attachment_path');
    await queryInterface.removeColumn('Tickets', 'resolution_type');
  }
};
