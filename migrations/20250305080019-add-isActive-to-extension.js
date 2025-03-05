"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("Extensions", "isActive", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false, // Default is inactive
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn("Extensions", "isActive");
  },
};
