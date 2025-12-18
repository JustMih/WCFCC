'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create TicketCharts table
    await queryInterface.createTable('TicketCharts', {
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
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      user_name: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      message: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    });

    // Add indexes
    try {
      await queryInterface.addIndex('TicketCharts', ['ticket_id'], {
        name: 'idx_ticket_chart_ticket_id'
      });
    } catch (error) {
      if (!error.message.includes('Duplicate key name')) {
        throw error;
      }
    }
    
    try {
      await queryInterface.addIndex('TicketCharts', ['user_id'], {
        name: 'idx_ticket_chart_user_id'
      });
    } catch (error) {
      if (!error.message.includes('Duplicate key name')) {
        throw error;
      }
    }
    
    try {
      await queryInterface.addIndex('TicketCharts', ['created_at'], {
        name: 'idx_ticket_chart_created_at'
      });
    } catch (error) {
      if (!error.message.includes('Duplicate key name')) {
        throw error;
      }
    }

    // Create TicketChartReads table
    await queryInterface.createTable('TicketChartReads', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      ticket_chart_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'TicketCharts',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      read_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    });

    // Add indexes for TicketChartReads
    try {
      await queryInterface.addIndex('TicketChartReads', ['ticket_chart_id'], {
        name: 'idx_ticket_chart_read_chart_id'
      });
    } catch (error) {
      if (!error.message.includes('Duplicate key name')) {
        throw error;
      }
    }
    
    try {
      await queryInterface.addIndex('TicketChartReads', ['user_id'], {
        name: 'idx_ticket_chart_read_user_id'
      });
    } catch (error) {
      if (!error.message.includes('Duplicate key name')) {
        throw error;
      }
    }
    
    try {
      await queryInterface.addIndex('TicketChartReads', ['ticket_chart_id', 'user_id'], {
        name: 'idx_ticket_chart_read_unique',
        unique: true
      });
    } catch (error) {
      if (!error.message.includes('Duplicate key name')) {
        throw error;
      }
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('TicketChartReads');
    await queryInterface.dropTable('TicketCharts');
  }
};

