const { DataTypes } = require('sequelize');
const sequelize = require('../config/mysql_connection');

const Ticket = sequelize.define(
  'Ticket',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    ticket_id: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by'
    },
    assigned_to_id: DataTypes.UUID,
    attended_by_id: DataTypes.UUID,
    rated_by_id: DataTypes.UUID,
    responsible_unit_id: DataTypes.UUID,
    converted_by_id: DataTypes.UUID,
    forwarded_by_id: DataTypes.UUID,
    assigned_to: DataTypes.UUID,
    assigned_by: DataTypes.UUID,
    assigned_officer_id: DataTypes.UUID,

    // Personal Information
    first_name: { type: DataTypes.STRING(50), allowNull: false },
    middle_name: DataTypes.STRING(50),
    last_name: { type: DataTypes.STRING(50), allowNull: false },
    phone_number: { type: DataTypes.STRING(20), allowNull: false },
    nida_number: DataTypes.STRING(20),
    requester: { type: DataTypes.STRING(100), allowNull: false },
    institution: DataTypes.STRING(100),
    region: DataTypes.STRING(50),
    district: DataTypes.STRING(50),

    // Ticket Details
    subject: { type: DataTypes.STRING(200), allowNull: false },
    category: {
      type: DataTypes.ENUM('Inquiry', 'Complaint', 'Suggestion', 'Compliment', 'Congrats'),
      allowNull: false
    },
    sub_section: DataTypes.STRING(100),
    section: DataTypes.STRING(100),
    channel: { type: DataTypes.STRING(50), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
    complaint_type: DataTypes.ENUM('Minor', 'Major'),
    converted_to: DataTypes.STRING(100),
    status: {
      type: DataTypes.ENUM(
        'Open', 'Assigned', 'Carried Forward', 'In Progress',
        'Returned', 'Closed', 'Pending Review', 'Pending Approval'
      ),
      defaultValue: 'Open'
    },

    // Dates
    request_registered_date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    date_of_resolution: DataTypes.DATE,
    date_of_feedback: DataTypes.DATE,
    date_of_review_resolution: DataTypes.DATE,
    converted_at: DataTypes.DATE,
    forwarded_at: DataTypes.DATE,
    assigned_at: DataTypes.DATE,

    // Additional
    resolution_details: DataTypes.TEXT,
    aging_days: { type: DataTypes.INTEGER, defaultValue: 0 },
    responsible_unit_name: DataTypes.STRING,
    assigned_to_role: DataTypes.ENUM('Agent', 'Coordinator', 'Attendee', 'Head of Unit', 'Director', 'DG'),
    evidence_url: DataTypes.STRING,
    review_notes: DataTypes.TEXT,
    approval_notes: DataTypes.TEXT
  },
  {
    tableName: 'Tickets',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true,
    indexes: [
      { name: 'idx_ticket_status', fields: ['status'] },
      { name: 'idx_ticket_category', fields: ['category'] },
      { name: 'idx_ticket_created_at', fields: ['created_at'] },
      { name: 'idx_ticket_created_by', fields: ['created_by'] },
      { name: 'idx_ticket_assigned', fields: ['assigned_to_id'] },
      { name: 'idx_tickets_assigned_to', fields: ['assigned_to'] },
      { name: 'idx_tickets_assigned_by', fields: ['assigned_by'] }
    ]
  }
);

// Define associations cleanly inside associate()
Ticket.associate = (models) => {
  Ticket.belongsTo(models.User, { foreignKey: 'userId', as: 'creator' });
  Ticket.belongsTo(models.User, { foreignKey: 'assigned_to_id', as: 'assignee' });
  Ticket.belongsTo(models.User, { foreignKey: 'attended_by_id', as: 'attendedBy' });
  Ticket.belongsTo(models.User, { foreignKey: 'rated_by_id', as: 'ratedBy' });
  Ticket.belongsTo(models.User, { foreignKey: 'converted_by_id', as: 'convertedBy' });
  Ticket.belongsTo(models.User, { foreignKey: 'forwarded_by_id', as: 'forwardedBy' });
  Ticket.belongsTo(models.User, { foreignKey: 'assigned_by', as: 'assignedBy' });

  Ticket.belongsTo(models.Section, { foreignKey: 'responsible_unit_id', as: 'responsibleSection' });
  Ticket.belongsTo(models.Function, { foreignKey: 'responsible_unit_id', as: 'responsibleUnit' });

  Ticket.belongsTo(models.AssignedOfficer, {
    foreignKey: 'assigned_officer_id',
    as: 'assignedOfficer',
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL'
  });
};

module.exports = Ticket;
