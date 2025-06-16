module.exports = {
  up: async (queryInterface, Sequelize) => {
    return queryInterface.addColumn("instagram_comments", "read", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },
  down: async (queryInterface, Sequelize) => {
    return queryInterface.removeColumn("instagram_comments", "read");
  },
};
