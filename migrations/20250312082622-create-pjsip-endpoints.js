'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("pjsip_endpoints", {
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
      },
      transport: { type: Sequelize.STRING, allowNull: false },
      aors: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "pjsip_aors", key: "id" },
        unique: true,
      },
      auth: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "pjsip_auths", key: "id" },
        unique: true,
      },
      context: { type: Sequelize.STRING, allowNull: false },
      disallow: { type: Sequelize.STRING, allowNull: false },
      allow: { type: Sequelize.STRING, allowNull: false },
      direct_media: { type: Sequelize.STRING, allowNull: false },
      outbound_proxy: { type: Sequelize.STRING, allowNull: true },
      from_domain: { type: Sequelize.STRING, allowNull: true },
      qualify_frequency: { type: Sequelize.INTEGER, allowNull: false },
      media_address: { type: Sequelize.STRING, allowNull: true },
      dtmf_mode: { type: Sequelize.STRING, allowNull: false },
      force_rport: { type: Sequelize.STRING, allowNull: false },
      comedia: { type: Sequelize.STRING, allowNull: false },
      rtp_symmetric: { type: Sequelize.STRING, allowNull: false },
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable("pjsip-endpoints");
  }
}
