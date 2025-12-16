"use strict";

const fs = require("fs");
const path = require("path");
const Sequelize = require("sequelize");
const sequelize = require("../config/mysql_connection");
const DataTypes = Sequelize.DataTypes;

const basename = path.basename(__filename);
const db = {};

fs.readdirSync(__dirname)
  .filter(
    (file) =>
      file.indexOf(".") !== 0 && file !== basename && file.slice(-3) === ".js"
  )
  .forEach((file) => {
    const model = require(path.join(__dirname, file));
    console.log("📦 Loaded model:", model.name); // Add this
    db[model.name] = model;
  });

Object.keys(db).forEach((modelName) => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

// Setup associations centrally
// Ensure IVRAction and IVRVoice are available in db before destructuring
const IVRDTMFMapping = db.IVRDTMFMapping;
const IVRVoice = db.IVRVoice || require("./IVRVoice");
const IVRAction = db.IVRAction || require("./IVRAction");

// Make sure they're in db for exports
if (!db.IVRVoice) db.IVRVoice = IVRVoice;
if (!db.IVRAction) db.IVRAction = IVRAction;
const EmergencyNumber = require("./emergency_number")(sequelize, DataTypes);
db.EmergencyNumber = EmergencyNumber;

const Holiday = require("./holiday")(sequelize, Sequelize.DataTypes);
db.holidays = Holiday; // lowercase 'holidays'
const RecordedAudio = require("./recorded_audio.model.js")(
  sequelize,
  Sequelize.DataTypes
);
db.RecordedAudio = RecordedAudio;
const IVRDTMFLog = require("./IVRDTMFLog")(sequelize, DataTypes);

db.IVRDTMFLog = IVRDTMFLog;

// Import new lookup table models
const ReportTo = require("./ReportTo");
const Designation = require("./Designation");
const UnitSection = require("./UnitSection");
const NewRole = require("./NewRole");
const UserRole = require("./UserRole");
const Relation = require("./Relation");
const Directorate = require("./Directorate");
const Unit = require("./Unit");
const Subject = require("./Subject");

db.ReportTo = ReportTo;
db.Designation = Designation;
db.UnitSection = UnitSection;
db.NewRole = NewRole;
db.UserRole = UserRole;
db.Relation = Relation;
db.Directorate = Directorate;
db.Unit = Unit;
db.Subject = Subject;

// Note: Associations for Unit, Subject, and Directorate are defined in their respective model files
// via the associate() function, which is automatically called above (lines 23-27)

console.log("Loaded models:", Object.keys(db)); // Debugging models

IVRDTMFMapping.belongsTo(IVRVoice, { foreignKey: "ivr_voice_id", as: "voice" });
IVRDTMFMapping.belongsTo(IVRAction, { foreignKey: "action_id", as: "action" });

IVRVoice.hasMany(IVRDTMFMapping, {
  foreignKey: "ivr_voice_id",
  as: "mappings",
});
IVRAction.hasMany(IVRDTMFMapping, { foreignKey: "action_id", as: "mappings" });

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
