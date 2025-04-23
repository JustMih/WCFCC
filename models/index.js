"use strict";

const fs = require("fs");
const path = require("path");
const Sequelize = require("sequelize");
const sequelize = require("../config/mysql_connection");

const basename = path.basename(__filename);
const db = {};

// Import all models
fs.readdirSync(__dirname)
  .filter((file) => (
    file.indexOf(".") !== 0 && file !== basename && file.slice(-3) === ".js"
  ))
  .forEach((file) => {
    const model = require(path.join(__dirname, file));
    db[model.name] = model;
  });

// Setup associations centrally
const { IVRDTMFMapping, IVRVoice, IVRAction } = db;  // Ensure model names are singular and match exports

console.log("Loaded models:", Object.keys(db));  // Debugging models

IVRDTMFMapping.belongsTo(IVRVoice, { foreignKey: 'ivr_voice_id', as: 'voice' });
IVRDTMFMapping.belongsTo(IVRAction, { foreignKey: 'action_id', as: 'action' });

IVRVoice.hasMany(IVRDTMFMapping, { foreignKey: 'ivr_voice_id', as: 'mappings' });
IVRAction.hasMany(IVRDTMFMapping, { foreignKey: 'action_id', as: 'mappings' });


db.sequelize = sequelize;
db.Sequelize = Sequelize;


module.exports = {
  IVRAction,
  IVRVoice,
  IVRDTMFMapping,
  sequelize,
};
