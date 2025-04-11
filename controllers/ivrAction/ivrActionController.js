const IVRAction = require("../../models/IVRAction");

// Create a new extension
const addIVRAction = async (req, res) => {
  try {
    const {  name } = req.body;

    // Create ivr action
    const ivrAction = await IVRAction.create({
      name,
    });

    return res
      .status(201)
      .json({ message: "ivr action created successfully", ivrAction });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error creating ivr action", error: error.message });
  }
};

// Get all extensions
const getAllIVRActions = async (req, res) => {
  try {
    const ivrAction = await IVRAction.findAll();
    return res.status(200).json({ ivrAction });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error fetching ivr action", error: error.message });
  }
};

// Get a single extension by ID
const getIVRActionById = async (req, res) => {
  try {
    const { id } = req.params;
    const ivrAction = await IVRAction.findByPk(id);
    if (!ivrAction) {
      return res.status(404).json({ message: "ivr action not found" });
    }
    return res.status(200).json({ ivrAction });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error fetching ivr action", error: error.message });
  }
};

// Update an extension
const updateIVRAction = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;

    // Check if extension exists
    const ivrAction = await IVRAction.findByPk(id);
    if (!ivrAction) {
      return res.status(404).json({ message: "IVR Action not found" });
    }

    // Update the extension
    await ivrAction.update(updatedData);
    return res
      .status(200)
      .json({ message: "ivr action updated successfully", ivrAction });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error updating ivr action", error: error.message });
  }
};

// Delete an extension
const deleteIVRAction = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if extension exists
    const ivrAction = await IVRAction.findByPk(id);
    if (!ivrAction) {
      return res.status(404).json({ message: "ivr action not found" });
    }

    // Delete extension
    await ivrAction.destroy();
    return res.status(200).json({ message: "ivr action deleted successfully" });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error deleting ivr action", error: error.message });
  }
};

module.exports = {
  addIVRAction,
  getAllIVRActions,
  getIVRActionById,
  updateIVRAction,
  deleteIVRAction,
};
