"use strict";

const fs = require("fs");
const path = require("path");
const Sequelize = require("sequelize");
const sequelize = require("../config/mysql_connection");
const DataTypes = Sequelize.DataTypes;

const basename = path.basename(__filename);
const db = {};
//const IVRDTMFMapping = require("./IVRDTMFMapping")
// Import all models
fs.readdirSync(__dirname)
  .filter((file) => (
    file.indexOf(".") !== 0 && file !== basename && file.slice(-3) === ".js"
  ))
  .forEach((file) => {
    const model = require(path.join(__dirname, file));
    db[model.name] = model;
  });

// Setup associations
Object.keys(db).forEach((modelName) => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

// Setup associations centrally
const { IVRDTMFMapping, IVRVoice, IVRAction } = db;  // Ensure model names are singular and match exports
const EmergencyNumber = require('./emergency_number')(sequelize, DataTypes);
db.EmergencyNumber = EmergencyNumber;

const Holiday = require("./holiday")(sequelize, Sequelize.DataTypes);
db.holidays = Holiday; // lowercase 'holidays'

console.log("Loaded models:", Object.keys(db));  // Debugging models

IVRDTMFMapping.belongsTo(IVRVoice, { foreignKey: 'ivr_voice_id', as: 'voice' });
IVRDTMFMapping.belongsTo(IVRAction, { foreignKey: 'action_id', as: 'action' });

IVRVoice.hasMany(IVRDTMFMapping, { foreignKey: 'ivr_voice_id', as: 'mappings' });
IVRAction.hasMany(IVRDTMFMapping, { foreignKey: 'action_id', as: 'mappings' });


db.sequelize = sequelize;
db.Sequelize = Sequelize;


 
  db.sequelize = sequelize;
  db.Sequelize = Sequelize;
  
  module.exports = db;
  
 
// models/index.js
// IVRDTMFMapping.belongsTo(IVRVoice, { foreignKey: "ivr_voice_id" });
IVRDTMFMapping.belongsTo(IVRAction, { foreignKey: "action_id" });

IVRVoice.hasMany(IVRDTMFMapping, { foreignKey: "ivr_voice_id" });
IVRAction.hasMany(IVRDTMFMapping, { foreignKey: "action_id" });

module.exports = db;
