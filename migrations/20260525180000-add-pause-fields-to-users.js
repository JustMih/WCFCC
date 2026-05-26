"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Users", "pause_activity", {
      type: Sequelize.STRING(100),
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.addColumn("Users", "pause_started_at", {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Users", "pause_started_at");
    await queryInterface.removeColumn("Users", "pause_activity");
  },
};
