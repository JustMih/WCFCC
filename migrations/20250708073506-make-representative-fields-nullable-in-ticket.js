'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.changeColumn('Tickets', 'representative_name', {
      type: Sequelize.STRING(100),
      allowNull: true
    });
    await queryInterface.changeColumn('Tickets', 'representative_phone', {
      type: Sequelize.STRING(20),
      allowNull: true
    });
    await queryInterface.changeColumn('Tickets', 'representative_email', {
      type: Sequelize.STRING(100),
      allowNull: true
    });
    await queryInterface.changeColumn('Tickets', 'representative_address', {
      type: Sequelize.STRING(200),
      allowNull: true
    });
    await queryInterface.changeColumn('Tickets', 'representative_relationship', {
      type: Sequelize.STRING(50),
      allowNull: true
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.changeColumn('Tickets', 'representative_name', {
      type: Sequelize.STRING(100),
      allowNull: false
    });
    await queryInterface.changeColumn('Tickets', 'representative_phone', {
      type: Sequelize.STRING(20),
      allowNull: false
    });
    await queryInterface.changeColumn('Tickets', 'representative_email', {
      type: Sequelize.STRING(100),
      allowNull: true
    });
    await queryInterface.changeColumn('Tickets', 'representative_address', {
      type: Sequelize.STRING(200),
      allowNull: true
    });
    await queryInterface.changeColumn('Tickets', 'representative_relationship', {
      type: Sequelize.STRING(50),
      allowNull: false
    });
  }
};
