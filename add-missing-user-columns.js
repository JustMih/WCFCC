const sequelize = require("./config/mysql_connection");
const { QueryTypes } = require("sequelize");

async function addMissingColumns() {
  try {
    console.log("Checking for missing columns in Users table...");

    // Check which columns exist
    const columns = await sequelize.query(
      `SELECT COLUMN_NAME 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'Users' 
       AND COLUMN_NAME IN ('unit_section', 'sub_section')`,
      { type: QueryTypes.SELECT }
    );

    const existingColumns = Array.isArray(columns)
      ? columns.map((col) => col.COLUMN_NAME)
      : [];
    const columnsToAdd = [];

    if (!existingColumns.includes("unit_section")) {
      columnsToAdd.push({
        name: "unit_section",
        type: "VARCHAR(100)",
        comment: "The specific unit/directorate this user belongs to",
      });
    } else {
      console.log("✅ unit_section column already exists");
    }

    if (!existingColumns.includes("sub_section")) {
      columnsToAdd.push({
        name: "sub_section",
        type: "VARCHAR(100)",
        comment: "The sub-section (function) within a directorate",
      });
    } else {
      console.log("✅ sub_section column already exists");
    }

    if (columnsToAdd.length === 0) {
      console.log("✅ All columns already exist. No changes needed.");
      await sequelize.close();
      return;
    }

    // Add missing columns
    for (const col of columnsToAdd) {
      console.log(`Adding ${col.name} column to Users table...`);
      await sequelize.query(
        `ALTER TABLE Users 
         ADD COLUMN ${col.name} ${col.type} NULL DEFAULT NULL 
         COMMENT '${col.comment}'`,
        { type: QueryTypes.RAW }
      );
      console.log(`✅ Successfully added ${col.name} column`);
    }

    console.log("✅ All missing columns have been added successfully");
    await sequelize.close();
  } catch (error) {
    console.error("❌ Error adding columns:", error);
    await sequelize.close();
    process.exit(1);
  }
}

addMissingColumns();
