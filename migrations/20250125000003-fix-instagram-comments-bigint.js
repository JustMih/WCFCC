'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // First, remove the primary key constraint
    await queryInterface.removeConstraint('instagram_comments', 'PRIMARY');
    
    // Change the column type
    await queryInterface.changeColumn('instagram_comments', 'id', {
      type: Sequelize.BIGINT,
      allowNull: false
    });

    // Add back the primary key constraint
    await queryInterface.addConstraint('instagram_comments', {
      fields: ['id'],
      type: 'primary key',
      name: 'PRIMARY'
    });

    await queryInterface.changeColumn('instagram_comments', 'media_id', {
      type: Sequelize.BIGINT,
      allowNull: true
    });

    await queryInterface.changeColumn('instagram_comments', 'parent_id', {
      type: Sequelize.BIGINT,
      allowNull: true
    });

    await queryInterface.changeColumn('instagram_comments', 'from_id', {
      type: Sequelize.BIGINT,
      allowNull: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('instagram_comments', 'id', {
      type: Sequelize.INTEGER,
      allowNull: false,
      primaryKey: true
    });

    await queryInterface.changeColumn('instagram_comments', 'media_id', {
      type: Sequelize.INTEGER,
      allowNull: true
    });

    await queryInterface.changeColumn('instagram_comments', 'parent_id', {
      type: Sequelize.INTEGER,
      allowNull: true
    });

    await queryInterface.changeColumn('instagram_comments', 'from_id', {
      type: Sequelize.INTEGER,
      allowNull: true
    });
  }
};
