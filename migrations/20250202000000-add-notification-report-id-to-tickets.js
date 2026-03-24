'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Tickets', 'notification_report_id', {
      type: Sequelize.STRING(100),
      allowNull: true,
      comment: 'Notification report ID for MAC redirect (same as used on ticket creation)',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('Tickets', 'notification_report_id');
  },
};
