'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('AuditLogs', {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      category: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'api',
      },
      action: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },
      entityType: {
        type: Sequelize.STRING(120),
        allowNull: true,
      },
      entityId: {
        type: Sequelize.STRING(120),
        allowNull: true,
      },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'success',
      },
      message: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'Users',
          key: 'id',
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      actorName: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      actorEmail: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      role: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      method: {
        type: Sequelize.STRING(10),
        allowNull: true,
      },
      path: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      requestId: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      ip: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      userAgent: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      metadata: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      beforeState: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      afterState: {
        type: Sequelize.JSON,
        allowNull: true,
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

    await queryInterface.addIndex('AuditLogs', ['createdAt']);
    await queryInterface.addIndex('AuditLogs', ['category']);
    await queryInterface.addIndex('AuditLogs', ['action']);
    await queryInterface.addIndex('AuditLogs', ['status']);
    await queryInterface.addIndex('AuditLogs', ['userId']);
    await queryInterface.addIndex('AuditLogs', ['requestId']);
    await queryInterface.addIndex('AuditLogs', ['entityType', 'entityId']);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('AuditLogs');
  }
};
