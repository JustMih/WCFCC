// models/IVRDTMFMapping.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/mysql_connection");

const IVRDTMFMapping = sequelize.define("IVRDTMFMapping", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  dtmf_digit: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  action_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  parameter: {
    type: DataTypes.STRING,
  },
  ivr_voice_id: {
    type: DataTypes.UUID,
    allowNull: false,
  }
});

module.exports = IVRDTMFMapping;
