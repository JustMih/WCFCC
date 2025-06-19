const { DataTypes } = require('sequelize');
const sequelize = require('../config/mysql_connection');

const Employer = sequelize.define(
  'Employer',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    registration_number: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    tin: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    employer_status: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    allocated_staff_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    allocated_staff_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    allocated_staff_username: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'Employer',
    tableName: 'Employers',
    timestamps: true,
  }
);

module.exports = Employer; 