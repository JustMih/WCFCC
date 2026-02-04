'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Add dtls_verify column to pjsip_endpoints table
    await queryInterface.addColumn("pjsip_endpoints", "dtls_verify", {
      type: Sequelize.STRING(10),
      allowNull: true,
      defaultValue: null,
    });
  },

  async down (queryInterface, Sequelize) {
    // Remove the column in reverse
    await queryInterface.removeColumn('pjsip_endpoints', 'dtls_verify');
  }
};
