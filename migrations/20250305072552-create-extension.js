module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("Extensions", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      id_alias: { type: Sequelize.INTEGER, allowNull: false },
      transport: { type: Sequelize.STRING, allowNull: false },
      aors: { type: Sequelize.INTEGER, allowNull: false },
      auth: { type: Sequelize.INTEGER, allowNull: false },
      context: { type: Sequelize.STRING, allowNull: false },
      disallow: { type: Sequelize.STRING, allowNull: false },
      allow: { type: Sequelize.STRING, allowNull: false },
      dtmf_mode: { type: Sequelize.STRING, allowNull: false },
      callerid: { type: Sequelize.INTEGER, allowNull: false },
      direct_media: { type: Sequelize.STRING, allowNull: false },
      force_rport: { type: Sequelize.STRING, allowNull: false },
      rewrite_contact: { type: Sequelize.STRING, allowNull: false },
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "Users", key: "id" },
        unique: true,
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable("Extensions");
  },
};
