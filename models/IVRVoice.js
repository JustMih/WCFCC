const { DataTypes } = require("sequelize");
const sequelize = require("../config/mysql_connection");

const IVRVoice = sequelize.define("IVRVoice", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  file_name: { type: DataTypes.STRING, allowNull: false },
  file_path: { type: DataTypes.STRING, allowNull: false },
});

module.exports = IVRVoice; 
