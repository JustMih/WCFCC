const { DataTypes } = require("sequelize");
const sequelize = require("../config/mysql_connection");

// Import the IVRDTMFMapping model
const IVRDTMFMapping = require("./ivr_dtmf_mappings.model");
const IVRVoice = sequelize.define("IVRVoice", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  file_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  file_path: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  language: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "swahili", // or "english"
  },
});

// Define associations
IVRVoice.hasMany(IVRDTMFMapping, { foreignKey: 'ivr_voice_id' });

module.exports = IVRVoice;

