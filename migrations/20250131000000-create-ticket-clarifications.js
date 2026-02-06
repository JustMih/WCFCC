'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Ticket_clarifications', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      ticket_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'Tickets',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      edited_by_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      edited_by_name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      edited_by_role: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      edited_by_email: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      clarification_text: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Create unique index to prevent duplicates
    await queryInterface.addIndex('Ticket_clarifications', {
      fields: ['ticket_id', 'edited_by_id', 'edited_by_role'],
      unique: true,
      name: 'unique_ticket_user_role_clarification'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeIndex('Ticket_clarifications', 'unique_ticket_user_role_clarification');
    await queryInterface.dropTable('Ticket_clarifications');
  }
};
