module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("AgentLoginLog", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "Users",
          key: "id",
        },
        onDelete: "CASCADE",
      },
      role: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      loginTime: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      logoutTime: {
        type: Sequelize.DATE,
        allowNull: true, // Will be NULL until agent logs out
      },
      totalOnlineTime: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0, // Total time in seconds
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable("AgentLoginLog");
  },
};
