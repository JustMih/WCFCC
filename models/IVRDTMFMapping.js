 const { DataTypes } = require("sequelize");
const sequelize = require("../config/mysql_connection");
const IVRAction = require("./IVRAction");
const IVRVoice= require("./IVRVoice");
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
    type: DataTypes.INTEGER, // FIXED: match MySQL `int`
    allowNull: false,
  },
  parameter: {
    type: DataTypes.STRING,
  },
  ivr_voice_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  language: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "english",
  },
  menu_context: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: "general",
  }
});

IVRDTMFMapping.belongsTo(IVRAction, { foreignKey: 'action_id', as: 'action' });
IVRDTMFMapping.belongsTo(IVRVoice, { foreignKey: 'ivr_voice_id', as: 'voice' });

module.exports = IVRDTMFMapping;
