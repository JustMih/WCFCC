"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("pjsip_aors", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        allowNull: false,
        autoIncrement: true,
      },
      max_contacts: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      qualify_frequency: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: null,
      },
      contact: {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: null,
      },
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable("pjsip_aors");
  },
};
