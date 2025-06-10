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
    type: DataTypes.UUID,
    allowNull: false,
  },
  parameter: {
    type: DataTypes.STRING,
  },
  ivr_voice_id: {
    type: DataTypes.UUID,  // Change this to UUID to match IVRVoice model
    allowNull: false,
  },
});

IVRDTMFMapping.belongsTo(IVRAction, { foreignKey: 'action_id' });
IVRDTMFMapping.belongsTo(IVRVoice, { foreignKey: 'ivr_voice_id' });

module.exports = IVRDTMFMapping;
