'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('Tickets', 'representative_name', {
      type: Sequelize.STRING(100),
      allowNull: false
    });
    await queryInterface.addColumn('Tickets', 'representative_phone', {
      type: Sequelize.STRING(20),
      allowNull: false
    });
    await queryInterface.addColumn('Tickets', 'representative_email', {
      type: Sequelize.STRING(100),
      allowNull: true
    });
    await queryInterface.addColumn('Tickets', 'representative_address', {
      type: Sequelize.STRING(200),
      allowNull: true
    });
    await queryInterface.addColumn('Tickets', 'representative_relationship', {
      type: Sequelize.STRING(50),
      allowNull: false
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('Tickets', 'representative_name');
    await queryInterface.removeColumn('Tickets', 'representative_phone');
    await queryInterface.removeColumn('Tickets', 'representative_email');
    await queryInterface.removeColumn('Tickets', 'representative_address');
    await queryInterface.removeColumn('Tickets', 'representative_relationship');
  }
};
