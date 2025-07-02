const { DataTypes } = require('sequelize');
const sequelize = require('../config/mysql_connection');
const Ticket = require('./Ticket');

const RequesterDetails = sequelize.define(
  'RequesterDetails',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    ticketId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: Ticket, 
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    phoneNumber: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    address: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    relationshipToEmployee: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'RequesterDetails',
    tableName: 'RequesterDetails',
    timestamps: true,
  }
);

RequesterDetails.belongsTo(Ticket, { foreignKey: 'ticketId' });
// Ticket.hasOne(RequesterDetails, { foreignKey: 'ticketId' });

module.exports = RequesterDetails; 