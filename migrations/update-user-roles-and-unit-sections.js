const { DataTypes } = require("sequelize");
const sequelize = require("../config/mysql_connection.js");

async function up() {
  try {
    console.log("🔄 Starting migration: Updating user roles and unit_section values...");
    
    // Update existing users: move section/unit names from role to unit_section
    const sectionUnitMappings = [
      { oldRole: "directorate of operations", newRole: "head-of-unit", unitSection: "directorate of operations" },
      { oldRole: "directorate of assessment services", newRole: "head-of-unit", unitSection: "directorate of assessment services" },
      { oldRole: "directorate of finance, planning and investment", newRole: "head-of-unit", unitSection: "directorate of finance, planning and investment" },
      { oldRole: "legal unit", newRole: "head-of-unit", unitSection: "legal unit" },
      { oldRole: "ict unit", newRole: "head-of-unit", unitSection: "ict unit" },
      { oldRole: "actuarial statistics and risk management", newRole: "head-of-unit", unitSection: "actuarial statistics and risk management" },
      { oldRole: "public relation unit", newRole: "head-of-unit", unitSection: "public relation unit" },
      { oldRole: "procurement management unit", newRole: "head-of-unit", unitSection: "procurement management unit" },
      { oldRole: "human resource management and attachment unit", newRole: "head-of-unit", unitSection: "human resource management and attachment unit" }
    ];
    
    for (const mapping of sectionUnitMappings) {
      const [affectedRows] = await sequelize.query(`
        UPDATE Users 
        SET role = ?, unit_section = ? 
        WHERE role = ?
      `, {
        replacements: [mapping.newRole, mapping.unitSection, mapping.oldRole]
      });
      
      if (affectedRows > 0) {
        console.log(`✅ Updated ${affectedRows} users from role '${mapping.oldRole}' to '${mapping.newRole}' with unit_section '${mapping.unitSection}'`);
      }
    }
    
    console.log("🎉 Migration completed successfully!");
    
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
}

async function down() {
  try {
    console.log("🔄 Rolling back migration...");
    
    // Note: We can't easily rollback the role changes without losing data
    console.log("⚠️  Note: Role changes cannot be automatically rolled back");
    console.log("⚠️  Note: unit_section values have been updated and cannot be easily restored");
    
    console.log("🎉 Rollback completed!");
    
  } catch (error) {
    console.error("❌ Rollback failed:", error);
    throw error;
  }
}

module.exports = { up, down }; 