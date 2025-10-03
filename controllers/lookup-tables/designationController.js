const Designation = require("../../models/Designation");
const { validationResult } = require("express-validator");

// Get all designations
const getAllDesignations = async (req, res) => {
  try {
    const designations = await Designation.findAll({
      order: [["name", "ASC"]],
    });
    res.status(200).json({
      success: true,
      data: designations,
    });
  } catch (error) {
    console.error("Error fetching designations:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get single designation by ID
const getDesignationById = async (req, res) => {
  try {
    const { id } = req.params;
    const designation = await Designation.findByPk(id);

    if (!designation) {
      return res.status(404).json({
        success: false,
        message: "Designation not found",
      });
    }

    res.status(200).json({
      success: true,
      data: designation,
    });
  } catch (error) {
    console.error("Error fetching designation:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Create new designation
const createDesignation = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors: errors.array(),
      });
    }

    const { name, description } = req.body;

    // Check if name already exists
    const existingDesignation = await Designation.findOne({ where: { name } });
    if (existingDesignation) {
      return res.status(400).json({
        success: false,
        message: "Designation with this name already exists",
      });
    }

    const newDesignation = await Designation.create({
      name,
      description,
    });

    res.status(201).json({
      success: true,
      message: "Designation created successfully",
      data: newDesignation,
    });
  } catch (error) {
    console.error("Error creating designation:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Update designation
const updateDesignation = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors: errors.array(),
      });
    }

    const { id } = req.params;
    const { name, description } = req.body;

    const designation = await Designation.findByPk(id);
    if (!designation) {
      return res.status(404).json({
        success: false,
        message: "Designation not found",
      });
    }

    // Check if name already exists (excluding current designation)
    if (name && name !== designation.name) {
      const existingDesignation = await Designation.findOne({
        where: { name },
      });
      if (existingDesignation) {
        return res.status(400).json({
          success: false,
          message: "Designation with this name already exists",
        });
      }
    }

    await designation.update({
      name: name || designation.name,
      description:
        description !== undefined ? description : designation.description,
    });

    res.status(200).json({
      success: true,
      message: "Designation updated successfully",
      data: designation,
    });
  } catch (error) {
    console.error("Error updating designation:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Delete designation
const deleteDesignation = async (req, res) => {
  try {
    const { id } = req.params;

    const designation = await Designation.findByPk(id);
    if (!designation) {
      return res.status(404).json({
        success: false,
        message: "Designation not found",
      });
    }

    await designation.destroy();

    res.status(200).json({
      success: true,
      message: "Designation deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting designation:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

module.exports = {
  getAllDesignations,
  getDesignationById,
  createDesignation,
  updateDesignation,
  deleteDesignation,
};
