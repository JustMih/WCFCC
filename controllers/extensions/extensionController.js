const Extension = require("../../models/Extension");
const User = require("../../models/User");

// Create a new extension
const addExtension = async (req, res) => {
  try {
    const {
      userId,
      id_alias,
      transport,
      aors,
      auth,
      context,
      disallow,
      allow,
      dtmf_mode,
      callerid,
      direct_media,
      force_rport,
      rewrite_contact,
      isActive,
    } = req.body;

    // Check if user exists
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Create extension
    const extension = await Extension.create({
      userId,
      id_alias,
      transport,
      aors,
      auth,
      context,
      disallow,
      allow,
      dtmf_mode,
      callerid,
      direct_media,
      force_rport,
      rewrite_contact,
      isActive: isActive ?? false, // Default to false if not provided
    });

    return res
      .status(201)
      .json({ message: "Extension created successfully", extension });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error creating extension", error: error.message });
  }
};


// Get all extensions
const getAllExtensions = async (req, res) => {
  try {
    const extensions = await Extension.findAll({
      include: [
        {
          model: User,
          attributes: {
            exclude: ["password", "createdAt", "updatedAt", "role"],
          },
        },
      ],
    });
    return res.status(200).json({ extensions });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error fetching extensions", error: error.message });
  }
};

// Get a single extension by ID
const getExtensionById = async (req, res) => {
  try {
    const { id } = req.params;
    const extension = await Extension.findByPk(id, {
      include: [
        {
          model: User,
          attributes: {
            exclude: ["password", "createdAt", "updatedAt", "role"],
          },
        },
      ],
    });
    if (!extension) {
      return res.status(404).json({ message: "Extension not found" });
    }
    return res.status(200).json({ extension });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error fetching extension", error: error.message });
  }
};

// Update an extension
const updateExtension = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;

    // Check if extension exists
    const extension = await Extension.findByPk(id);
    if (!extension) {
      return res.status(404).json({ message: "Extension not found" });
    }

    // Update the extension
    await extension.update(updatedData);
    return res
      .status(200)
      .json({ message: "Extension updated successfully", extension });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error updating extension", error: error.message });
  }
};

// Delete an extension
const deleteExtension = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if extension exists
    const extension = await Extension.findByPk(id);
    if (!extension) {
      return res.status(404).json({ message: "Extension not found" });
    }

    // Delete extension
    await extension.destroy();
    return res.status(200).json({ message: "Extension deleted successfully" });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error deleting extension", error: error.message });
  }
};

// Activate an extension
const activateExtension = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if extension exists
    const extension = await Extension.findByPk(id);
    if (!extension) {
      return res.status(404).json({ message: "Extension not found" });
    }

    // Activate extension
    extension.isActive = true;
    await extension.save();

    return res
      .status(200)
      .json({ message: "Extension activated successfully", extension });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error activating extension", error: error.message });
  }
};

// Deactivate an extension
const deactivateExtension = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if extension exists
    const extension = await Extension.findByPk(id);
    if (!extension) {
      return res.status(404).json({ message: "Extension not found" });
    }

    // Deactivate extension
    extension.isActive = false;
    await extension.save();

    return res
      .status(200)
      .json({ message: "Extension deactivated successfully", extension });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error deactivating extension", error: error.message });
  }
};

module.exports = {
  addExtension,
  getAllExtensions,
  getExtensionById,
  updateExtension,
  deleteExtension,
  activateExtension,
  deactivateExtension,
};
