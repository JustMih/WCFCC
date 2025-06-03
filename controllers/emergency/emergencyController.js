const db = require('../../models');
const EmergencyNumber = db.EmergencyNumber;

// Fetch all
exports.getAll = async (req, res) => {
  try {
    const numbers = await EmergencyNumber.findAll({ order: [['priority', 'ASC']] });
    res.json(numbers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Create new
exports.create = async (req, res) => {
  try {
    const { phone_number, priority } = req.body;
    const newNum = await EmergencyNumber.create({ phone_number, priority });
    res.status(201).json(newNum);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { phone_number, priority } = req.body;
    await EmergencyNumber.update({ phone_number, priority }, { where: { id } });
    res.json({ message: 'Updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete
exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    await EmergencyNumber.destroy({ where: { id } });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
