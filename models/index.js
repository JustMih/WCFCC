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
// models/index.js
// IVRDTMFMapping.belongsTo(IVRVoices, { foreignKey: "ivr_voice_id" });
// IVRDTMFMapping.belongsTo(IVRActions, { foreignKey: "action_id" });

IVRVoice.hasMany(IVRDTMFMapping, { foreignKey: "ivr_voice_id" });
IVRAction.hasMany(IVRDTMFMapping, { foreignKey: "action_id" });

// Ticket associations
// Ticket.belongsTo(User, { foreignKey: 'userId', as: 'creator' });
// Ticket.belongsTo(User, { foreignKey: 'assigned_to_id', as: 'assignee' });
// Ticket.belongsTo(User, { foreignKey: 'attended_by_id', as: 'attendedBy' });
// Ticket.belongsTo(User, { foreignKey: 'rated_by_id', as: 'ratedBy' });
// Ticket.belongsTo(FunctionModel, { foreignKey: 'responsible_unit_id', as: 'responsibleUnit' });
// Ticket.belongsTo(FunctionData, { foreignKey: 'function_data_id', as: 'functionData' });

// Function associations
// FunctionModel.belongsTo(Section, { foreignKey: 'section_id', as: 'section' });
// FunctionModel.hasMany(FunctionData, { foreignKey: 'function_id', as: 'functionData' });
// FunctionModel.hasMany(Ticket, { foreignKey: 'responsible_unit_id', as: 'tickets' });

// FunctionData associations
// FunctionData.belongsTo(FunctionModel, { foreignKey: 'function_id', as: 'parentFunction' });

// Section associations
// Section.hasMany(FunctionModel, { foreignKey: 'section_id', as: 'functions' });

module.exports = db;
