const { DataTypes } = require('sequelize');
const sequelize = require("../config/mysql_connection");
const IVRDTMFMapping = sequelize.define('IVRDTMFMapping', {
  id: {
    type: DataTypes.CHAR(36),
    primaryKey: true,
  },
  dtmf_digit: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  action_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  parameter: DataTypes.STRING(255),
  ivr_voice_id: {
    type: DataTypes.CHAR(36),
    allowNull: false,
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'IVRDTMFMappings',
  timestamps: false,
});

module.exports = IVRDTMFMapping;
