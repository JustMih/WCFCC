const { DataTypes } = require("sequelize");
const sequelize = require("../config/mysql_connection");

// Import IVRDTMFMapping model
const IVRDTMFMapping = require("./ivr_dtmf_mappings.model");

const IVRAction = sequelize.define("IVRAction", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
});

// Define the hasMany relationship
IVRAction.hasMany(IVRDTMFMapping, { foreignKey: 'action_id' });

module.exports = IVRAction;
