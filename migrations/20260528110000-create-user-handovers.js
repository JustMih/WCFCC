'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('UserHandovers', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      from_user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      to_user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      from_user_role: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      to_user_role: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      start_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      return_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('active', 'revoked', 'expired'),
        allowNull: false,
        defaultValue: 'active',
      },
      reason: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      revoked_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      revoked_by_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'Users',
          key: 'id',
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
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

    await queryInterface.addIndex('UserHandovers', ['from_user_id']);
    await queryInterface.addIndex('UserHandovers', ['to_user_id']);
    await queryInterface.addIndex('UserHandovers', ['status']);
    await queryInterface.addIndex('UserHandovers', ['return_at']);
    await queryInterface.addIndex('UserHandovers', ['from_user_id', 'status']);
    await queryInterface.addIndex('UserHandovers', ['to_user_id', 'status']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('UserHandovers');
  },
};
