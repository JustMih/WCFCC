const { DataTypes } = require('sequelize');
const sequelize = require('../config/mysql_connection.js');

const Ticket = sequelize.define(
  'Ticket',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },

    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by', // Physical DB field
      references: {
        model: 'Users',
        key: 'id'
      },
      onDelete: 'SET NULL'
    },
    
    assigned_to_id: {
      type: DataTypes.UUID,
      references: {
        model: 'Users',
        key: 'id',
      },
      onDelete: 'SET NULL',
    },

    attended_by_id: {
      type: DataTypes.UUID,
      references: {
        model: 'Users',
        key: 'id',
      },
      onDelete: 'SET NULL',
    },

    rated_by_id: {
      type: DataTypes.UUID,
      references: {
        model: 'Users',
        key: 'id',
      },
      onDelete: 'SET NULL',
    },

    responsible_unit_id: {
      type: DataTypes.UUID,
      references: {
        model: 'functions',
        key: 'id',
      },
      onDelete: 'SET NULL',
    },

    // function_data_id: {
    //   type: DataTypes.UUID,
    //   references: {
    //     model: 'function_data',
    //     key: 'id',
    //   },
    //   onDelete: 'SET NULL',
    // },

    // Other fields...
    first_name: DataTypes.STRING,
    middle_name: DataTypes.STRING,
    last_name: DataTypes.STRING,
    phone_number: DataTypes.STRING,
    nida_number: DataTypes.STRING,
    requester: DataTypes.STRING,
    institution: DataTypes.STRING,
    region: DataTypes.STRING,
    district: DataTypes.STRING,
    subject: DataTypes.STRING,
    category: DataTypes.ENUM('Inquiry', 'Complaint', 'Suggestion', 'Compliment'),
    sub_section: DataTypes.STRING,
    section: DataTypes.STRING,
    channel: DataTypes.STRING,
    description: DataTypes.TEXT,
    complaint_type: DataTypes.ENUM('Minor', 'Major'),
    converted_to: DataTypes.STRING,
    status: DataTypes.ENUM('Open', 'Assigned', 'Carried Forward', 'In Progress', 'Returned', 'Closed'),
    request_registered_date: DataTypes.DATE,
    date_of_resolution: DataTypes.DATE,
    date_of_feedback: DataTypes.DATE,
    date_of_review_resolution: DataTypes.DATE,
    resolution_details: DataTypes.TEXT,
    aging_days: DataTypes.INTEGER,
  },
  {
    tableName: 'Tickets',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true,
  }
);

// Associations inside model
Ticket.associate = (models) => {
  Ticket.belongsTo(models.User, { foreignKey: 'userId', as: 'creator' });
  Ticket.belongsTo(models.User, { foreignKey: 'assigned_to_id', as: 'assignee' });
  Ticket.belongsTo(models.User, { foreignKey: 'attended_by_id', as: 'attendedBy' });
  Ticket.belongsTo(models.User, { foreignKey: 'rated_by_id', as: 'ratedBy' });
  Ticket.belongsTo(models.Function, { foreignKey: 'responsible_unit_id', as: 'responsibleUnit' });
  // Ticket.belongsTo(models.FunctionData, { foreignKey: 'function_data_id', as: 'functionData' });
};

module.exports = Ticket;
