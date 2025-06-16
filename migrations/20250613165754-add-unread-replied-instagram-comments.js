'use strict';

/** @type {import('sequelize-cli').Migration} */module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('instagram_comments', 'unread', {
      type: Sequelize.BOOLEAN,
      defaultValue: true,
    });
    await queryInterface.addColumn('instagram_comments', 'replied', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('instagram_comments', 'unread');
    await queryInterface.removeColumn('instagram_comments', 'replied');
  },
};