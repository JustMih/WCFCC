'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Tickets', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      ticket_id: Sequelize.STRING,
      first_name: Sequelize.STRING,
      middle_name: Sequelize.STRING,
      last_name: Sequelize.STRING,
      phone_number: Sequelize.STRING,
      nida_number: Sequelize.STRING,
      requester: Sequelize.STRING,
      institution: Sequelize.STRING,
      region: Sequelize.STRING,
      district: Sequelize.STRING,
      subject: Sequelize.STRING,
      category: Sequelize.ENUM('Inquiry', 'Complaint', 'Suggestion', 'Compliment'),
      sub_section: Sequelize.STRING,
      section: Sequelize.STRING,
      description: Sequelize.TEXT,
      created_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'Users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      channel: Sequelize.STRING,
      complaint_type: Sequelize.ENUM('Minor', 'Major'),
      converted_to: Sequelize.STRING,
      rated_by_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'Users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      rated_at: Sequelize.DATE,
      responsible_unit_id: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      assigned_to_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      assigned_to_role: Sequelize.ENUM('Agent','Coordinator', 'Attendee', 'Focal', 'Manager', 'Director', 'DG'),
      status: Sequelize.ENUM( 'Open',
        'Assigned',
        'Carried Forward',
        'In Progress',
        'Returned',
        'Closed'),
      request_registered_date: Sequelize.DATE,
      date_of_resolution: Sequelize.DATE,
      date_of_feedback: Sequelize.DATE,
      date_of_review_resolution: Sequelize.DATE,
      resolution_details: Sequelize.TEXT,
      attended_by_id: Sequelize.UUID,
      aging_days: Sequelize.INTEGER,
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
      
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('Tickets');
  }
};
