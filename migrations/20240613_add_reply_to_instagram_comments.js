 'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
   
    await queryInterface.addColumn('instagram_comments', 'replied_by', {
      type: Sequelize.STRING,
      allowNull: true, // or use Sequelize.UUID if referencing a user table
    });

    await queryInterface.addColumn('instagram_comments', 'replied_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addColumn('instagram_comments', 'reply', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('instagram_comments', 'replied_by');
    await queryInterface.removeColumn('instagram_comments', 'replied_at');
    await queryInterface.removeColumn('instagram_comments', 'reply');
  },
};
