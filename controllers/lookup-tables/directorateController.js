const Directorate = require("../../models/Directorate");
const { validationResult } = require("express-validator");

// Get all directorates
const getAllDirectorates = async (req, res) => {
  try {
    const directorates = await Directorate.findAll({
      order: [["name", "ASC"]],
      raw: true,
    });
    // Map to camelCase for frontend
    const mappedDirectorates = directorates.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    }));
    res.status(200).json({
      success: true,
      data: mappedDirectorates,
    });
  } catch (error) {
    console.error("Error fetching directorates:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get single directorate by ID
const getDirectorateById = async (req, res) => {
  try {
    const { id } = req.params;
    const directorate = await Directorate.findByPk(id, {
      raw: true,
    });
    if (!directorate) {
      return res.status(404).json({
        success: false,
        message: "Directorate not found",
      });
    }
    const mappedDirectorate = {
      id: directorate.id,
      name: directorate.name,
      description: directorate.description,
      createdAt: directorate.created_at,
      updatedAt: directorate.updated_at,
    };
    res.status(200).json({
      success: true,
      data: mappedDirectorate,
    });
  } catch (error) {
    console.error("Error fetching directorate:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Create new directorate
const createDirectorate = async (req, res) => {
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

    const existingDirectorate = await Directorate.findOne({ where: { name } });
    if (existingDirectorate) {
      return res.status(400).json({
        success: false,
        message: "Directorate with this name already exists",
      });
    }

    const newDirectorate = await Directorate.create({
      name,
      description,
    });

    // Fetch the created directorate with raw data
    const createdDirectorate = await Directorate.findByPk(newDirectorate.id, {
      raw: true,
    });

    const mappedDirectorate = {
      id: createdDirectorate.id,
      name: createdDirectorate.name,
      description: createdDirectorate.description,
      createdAt: createdDirectorate.created_at,
      updatedAt: createdDirectorate.updated_at,
    };

    res.status(201).json({
      success: true,
      message: "Directorate created successfully",
      data: mappedDirectorate,
    });
  } catch (error) {
    console.error("Error creating directorate:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Update directorate
const updateDirectorate = async (req, res) => {
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

    const directorate = await Directorate.findByPk(id);
    if (!directorate) {
      return res.status(404).json({
        success: false,
        message: "Directorate not found",
      });
    }

    if (name && name !== directorate.name) {
      const existingDirectorate = await Directorate.findOne({
        where: { name },
      });
      if (existingDirectorate) {
        return res.status(400).json({
          success: false,
          message: "Directorate with this name already exists",
        });
      }
    }

    await directorate.update({
      name: name || directorate.name,
      description:
        description !== undefined ? description : directorate.description,
    });

    // Fetch the updated directorate with raw data
    const updatedDirectorate = await Directorate.findByPk(directorate.id, {
      raw: true,
    });

    const mappedDirectorate = {
      id: updatedDirectorate.id,
      name: updatedDirectorate.name,
      description: updatedDirectorate.description,
      createdAt: updatedDirectorate.created_at,
      updatedAt: updatedDirectorate.updated_at,
    };

    res.status(200).json({
      success: true,
      message: "Directorate updated successfully",
      data: mappedDirectorate,
    });
  } catch (error) {
    console.error("Error updating directorate:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Delete directorate
const deleteDirectorate = async (req, res) => {
  try {
    const { id } = req.params;
    const directorate = await Directorate.findByPk(id);
    if (!directorate) {
      return res.status(404).json({
        success: false,
        message: "Directorate not found",
      });
    }

    await directorate.destroy();
    res.status(200).json({
      success: true,
      message: "Directorate deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting directorate:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

module.exports = {
  getAllDirectorates,
  getDirectorateById,
  createDirectorate,
  updateDirectorate,
  deleteDirectorate,
};
