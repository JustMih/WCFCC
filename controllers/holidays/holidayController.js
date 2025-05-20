const db = require("../../models");         // ✅ Load all models from models/index.js
const Holiday = db.holidays;                // ✅ Match how it's defined in index.js

// Get all holidays
exports.getAllHolidays = async (req, res) => {
  try {
    const holidays = await Holiday.findAll({ order: [['holiday_date', 'ASC']] });
    res.json(holidays);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Add a holiday
exports.addHoliday = async (req, res) => {
  try {
    const { holiday_date, name } = req.body;
    const newHoliday = await Holiday.create({ holiday_date, name });
    res.status(201).json(newHoliday);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete a holiday
exports.deleteHoliday = async (req, res) => {
  try {
    const id = req.params.id;
    await Holiday.destroy({ where: { id } });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
