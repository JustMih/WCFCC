const UnitSection = require("../../models/UnitSection");
const { validationResult } = require("express-validator");

// Get all unit sections
const getAllUnitSections = async (req, res) => {
  try {
    const unitSections = await UnitSection.findAll({
      order: [["name", "ASC"]],
    });
    res.status(200).json({
      success: true,
      data: unitSections,
    });
  } catch (error) {
    console.error("Error fetching unit sections:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get single unit section by ID
const getUnitSectionById = async (req, res) => {
  try {
    const { id } = req.params;
    const unitSection = await UnitSection.findByPk(id);

    if (!unitSection) {
      return res.status(404).json({
        success: false,
        message: "Unit section not found",
      });
    }

    res.status(200).json({
      success: true,
      data: unitSection,
    });
  } catch (error) {
    console.error("Error fetching unit section:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Create new unit section
const createUnitSection = async (req, res) => {
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
    const existingUnitSection = await UnitSection.findOne({ where: { name } });
    if (existingUnitSection) {
      return res.status(400).json({
        success: false,
        message: "Unit section with this name already exists",
      });
    }

    const newUnitSection = await UnitSection.create({
      name,
      description,
    });

    res.status(201).json({
      success: true,
      message: "Unit section created successfully",
      data: newUnitSection,
    });
  } catch (error) {
    console.error("Error creating unit section:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Update unit section
const updateUnitSection = async (req, res) => {
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

    const unitSection = await UnitSection.findByPk(id);
    if (!unitSection) {
      return res.status(404).json({
        success: false,
        message: "Unit section not found",
      });
    }

    // Check if name already exists (excluding current unit section)
    if (name && name !== unitSection.name) {
      const existingUnitSection = await UnitSection.findOne({
        where: { name },
      });
      if (existingUnitSection) {
        return res.status(400).json({
          success: false,
          message: "Unit section with this name already exists",
        });
      }
    }

    await unitSection.update({
      name: name || unitSection.name,
      description:
        description !== undefined ? description : unitSection.description,
    });

    res.status(200).json({
      success: true,
      message: "Unit section updated successfully",
      data: unitSection,
    });
  } catch (error) {
    console.error("Error updating unit section:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Delete unit section
const deleteUnitSection = async (req, res) => {
  try {
    const { id } = req.params;

    const unitSection = await UnitSection.findByPk(id);
    if (!unitSection) {
      return res.status(404).json({
        success: false,
        message: "Unit section not found",
      });
    }

    await unitSection.destroy();

    res.status(200).json({
      success: true,
      message: "Unit section deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting unit section:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

module.exports = {
  getAllUnitSections,
  getUnitSectionById,
  createUnitSection,
  updateUnitSection,
  deleteUnitSection,
};
