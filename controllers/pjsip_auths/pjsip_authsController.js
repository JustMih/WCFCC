const  PjsipAuths  = require("../../models/pjsip_auths");

// Create
const createAuth = async (req, res) => {
  try {
    const { id, auth_type, username, password } = req.body;
    const auth = await PjsipAuths.create({ id, auth_type, username, password });
    res.status(201).json(auth);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Read
const getAllAuths = async (req, res) => {
  try {
    const auths = await PjsipAuths.findAll();
    res.status(200).json(auths);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getAuthById = async (req, res) => {
  try {
    const auth = await PjsipAuths.findByPk(req.params.id);
    if (auth) {
      res.status(200).json(auth);
    } else {
      res.status(404).json({ message: "Auth not found" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update
const updateAuth = async (req, res) => {
  try {
    const { id, auth_type, username, password } = req.body;
    const auth = await PjsipAuths.findByPk(req.params.id);
    if (auth) {
      auth.id = id || auth.id;
      auth.auth_type = auth_type || auth.auth_type;
      auth.username = username || auth.username;
      auth.password = password || auth.password;
      await auth.save();
      res.status(200).json(auth);
    } else {
      res.status(404).json({ message: "Auth not found" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Delete
const deleteAuth = async (req, res) => {
  try {
    const auth = await PjsipAuths.findByPk(req.params.id);
    if (auth) {
      await auth.destroy();
      res.status(200).json({ message: "Auth deleted" });
    } else {
      res.status(404).json({ message: "Auth not found" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


module.exports = {
  createAuth,
  getAllAuths,
  getAuthById,
  updateAuth,
  deleteAuth
};