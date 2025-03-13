const  PjsipAors  = require("../../models/pjsip_aors");

// Create
const createAor = async (req, res) => {
  try {
    const { id, max_contacts, qualify_frequency, contact } = req.body;
    const aor = await PjsipAors.create({
      id,
      max_contacts,
      qualify_frequency,
      contact,
    });
    res.status(201).json(aor);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Read
const getAllAors = async (req, res) => {
  try {
    const aors = await PjsipAors.findAll();
    res.status(200).json(aors);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
const getAorById = async (req, res) => {
  try {
    const aor = await PjsipAors.findByPk(req.params.id);
    if (aor) {
      res.status(200).json(aor);
    } else {
      res.status(404).json({ message: "Aor not found" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update
const updateAor = async (req, res) => {
  try {
    const { id, max_contacts, qualify_frequency, contact } = req.body;
    const aor = await PjsipAors.findByPk(req.params.id);
    if (aor) {
      aor.id = id || aor.id;
      aor.max_contacts = max_contacts || aor.max_contacts;
      aor.qualify_frequency = qualify_frequency || aor.qualify_frequency;
      aor.contact = contact || aor.contact;
      await aor.save();
      res.status(200).json(aor);
    } else {
      res.status(404).json({ message: "Aor not found" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Delete
const deleteAor = async (req, res) => {
  try {
    const aor = await PjsipAors.findByPk(req.params.id);
    if (aor) {
      await aor.destroy();
      res.status(200).json({ message: "Aor deleted" });
    } else {
      res.status(404).json({ message: "Aor not found" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createAor,
  getAllAors,
  getAorById,
  updateAor,
  deleteAor,
};
