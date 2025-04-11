module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("IVRVoice", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      file_name: { type: Sequelize.STRING, allowNull: false },
      file_path: { type: Sequelize.STRING, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable("IVRVoice");
  },
};
