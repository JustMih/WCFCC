// migrations/YYYYMMDDHHMMSS-update-ivrdtmfmapping.js
"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn("IVRDTMFMappings", "action_id", {
      type: Sequelize.INTEGER,
      allowNull: false,
    });
    await queryInterface.changeColumn("IVRDTMFMappings", "ivr_voice_id", {
      type: Sequelize.UUID,
      allowNull: false,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn("IVRDTMFMappings", "action_id", {
      type: Sequelize.UUID,
      allowNull: false,
    });
    await queryInterface.changeColumn("IVRDTMFMappings", "ivr_voice_id", {
      type: Sequelize.INTEGER,
      allowNull: false,
    });
  },
};