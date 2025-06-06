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
// Update a holiday
exports.updateHoliday = async (req, res) => {
  try {
    const id = req.params.id;
    const { holiday_date, name } = req.body;

    const holiday = await Holiday.findByPk(id);
    if (!holiday) {
      return res.status(404).json({ message: "Holiday not found" });
    }

    holiday.holiday_date = holiday_date;
    holiday.name = name;
    await holiday.save();

    res.status(200).json(holiday);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete a holiday
// exports.deleteHoliday = async (req, res) => {
//   try {
//     const id = req.params.id;
//     await Holiday.destroy({ where: { id } });
//     res.status(204).send();
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };
exports.deleteHoliday = async (req, res) => {
  try {
    const id = req.params.id;
    const deleted = await Holiday.destroy({ where: { id } });

    if (deleted === 0) {
      return res.status(404).json({ error: 'Holiday not found' });
    }

    res.status(204).send();
  } catch (err) {
    console.error("Server delete error:", err.message);
    res.status(500).json({ error: err.message });
  }
};
