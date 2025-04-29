"use strict";

const fs = require("fs");
const path = require("path");
const Sequelize = require("sequelize");
const sequelize = require("../config/mysql_connection"); // Use MySQL connection

const basename = path.basename(__filename);
const db = {};

// Automatically import all models in this folder
fs.readdirSync(__dirname)
  .filter((file) => {
    return (
      file.indexOf(".") !== 0 &&
      file !== basename &&
      file.slice(-3) === ".js" &&
      file.indexOf(".test.js") === -1
    );
  })
  .forEach((file) => {
    const model = require(path.join(__dirname, file))(
      sequelize,
      Sequelize.DataTypes
    );
    db[model.name] = model;
  });

Object.keys(db).forEach((modelName) => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;
// models/index.js
IVRDTMFMapping.belongsTo(IVRVoices, { foreignKey: "ivr_voice_id" });
IVRDTMFMapping.belongsTo(IVRActions, { foreignKey: "action_id" });

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
