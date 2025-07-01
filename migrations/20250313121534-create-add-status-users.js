"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("Users", "status", {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "offline", // Default is inactive
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn("Users", "status");
  },
};
