const Unit = require("../../models/Unit");
const Directorate = require("../../models/Directorate");
const { validationResult } = require("express-validator");

// Get all units
const getAllUnits = async (req, res) => {
  try {
    const units = await Unit.findAll({
      include: [
        {
          model: Directorate,
          as: "directorate",
          attributes: ["id", "name", "description"],
        },
      ],
      order: [["name", "ASC"]],
      raw: false,
    });
    // Map to camelCase for frontend
    const mappedUnits = units.map((u) => {
      const unitData = u.toJSON
        ? u.toJSON()
        : u.get
        ? u.get({ plain: true })
        : u;
      return {
        id: unitData.id,
        name: unitData.name,
        description: unitData.description,
        directorate_id: unitData.directorate_id,
        directorate: unitData.directorate,
        createdAt: unitData.created_at || unitData.createdAt,
        updatedAt: unitData.updated_at || unitData.updatedAt,
      };
    });
    res.status(200).json({
      success: true,
      data: mappedUnits,
    });
  } catch (error) {
    console.error("Error fetching units:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get single unit by ID
const getUnitById = async (req, res) => {
  try {
    const { id } = req.params;
    const unit = await Unit.findByPk(id, {
      include: [
        {
          model: Directorate,
          as: "directorate",
          attributes: ["id", "name", "description"],
        },
      ],
    });
    if (!unit) {
      return res.status(404).json({
        success: false,
        message: "Unit not found",
      });
    }
    const unitData = unit.toJSON
      ? unit.toJSON()
      : unit.get
      ? unit.get({ plain: true })
      : unit;
    const mappedUnit = {
      id: unitData.id,
      name: unitData.name,
      description: unitData.description,
      directorate_id: unitData.directorate_id,
      directorate: unitData.directorate,
      createdAt: unitData.created_at || unitData.createdAt,
      updatedAt: unitData.updated_at || unitData.updatedAt,
    };
    res.status(200).json({
      success: true,
      data: mappedUnit,
    });
  } catch (error) {
    console.error("Error fetching unit:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Create new unit
const createUnit = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors: errors.array(),
      });
    }

    const { name, description, directorate_id } = req.body;

    const existingUnit = await Unit.findOne({ where: { name } });
    if (existingUnit) {
      return res.status(400).json({
        success: false,
        message: "Unit with this name already exists",
      });
    }

    // Validate directorate_id if provided
    if (directorate_id) {
      const directorate = await Directorate.findByPk(directorate_id);
      if (!directorate) {
        return res.status(400).json({
          success: false,
          message: "Directorate not found",
        });
      }
    }

    const newUnit = await Unit.create({
      name,
      description,
      directorate_id: directorate_id || null,
    });

    const unitWithDirectorate = await Unit.findByPk(newUnit.id, {
      include: [
        {
          model: Directorate,
          as: "directorate",
          attributes: ["id", "name", "description"],
        },
      ],
    });

    const unitData = unitWithDirectorate.toJSON
      ? unitWithDirectorate.toJSON()
      : unitWithDirectorate.get
      ? unitWithDirectorate.get({ plain: true })
      : unitWithDirectorate;
    const mappedUnit = {
      id: unitData.id,
      name: unitData.name,
      description: unitData.description,
      directorate_id: unitData.directorate_id,
      directorate: unitData.directorate,
      createdAt: unitData.created_at || unitData.createdAt,
      updatedAt: unitData.updated_at || unitData.updatedAt,
    };

    res.status(201).json({
      success: true,
      message: "Unit created successfully",
      data: mappedUnit,
    });
  } catch (error) {
    console.error("Error creating unit:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Update unit
const updateUnit = async (req, res) => {
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
    const { name, description, directorate_id } = req.body;

    const unit = await Unit.findByPk(id);
    if (!unit) {
      return res.status(404).json({
        success: false,
        message: "Unit not found",
      });
    }

    if (name && name !== unit.name) {
      const existingUnit = await Unit.findOne({ where: { name } });
      if (existingUnit) {
        return res.status(400).json({
          success: false,
          message: "Unit with this name already exists",
        });
      }
    }

    // Validate directorate_id if provided
    if (directorate_id !== undefined) {
      if (directorate_id !== null) {
        const directorate = await Directorate.findByPk(directorate_id);
        if (!directorate) {
          return res.status(400).json({
            success: false,
            message: "Directorate not found",
          });
        }
      }
    }

    await unit.update({
      name: name || unit.name,
      description: description !== undefined ? description : unit.description,
      directorate_id:
        directorate_id !== undefined ? directorate_id : unit.directorate_id,
    });

    const updatedUnit = await Unit.findByPk(unit.id, {
      include: [
        {
          model: Directorate,
          as: "directorate",
          attributes: ["id", "name", "description"],
        },
      ],
    });

    const unitData = updatedUnit.toJSON
      ? updatedUnit.toJSON()
      : updatedUnit.get
      ? updatedUnit.get({ plain: true })
      : updatedUnit;
    const mappedUnit = {
      id: unitData.id,
      name: unitData.name,
      description: unitData.description,
      directorate_id: unitData.directorate_id,
      directorate: unitData.directorate,
      createdAt: unitData.created_at || unitData.createdAt,
      updatedAt: unitData.updated_at || unitData.updatedAt,
    };

    res.status(200).json({
      success: true,
      message: "Unit updated successfully",
      data: mappedUnit,
    });
  } catch (error) {
    console.error("Error updating unit:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Delete unit
const deleteUnit = async (req, res) => {
  try {
    const { id } = req.params;
    const unit = await Unit.findByPk(id);
    if (!unit) {
      return res.status(404).json({
        success: false,
        message: "Unit not found",
      });
    }

    await unit.destroy();
    res.status(200).json({
      success: true,
      message: "Unit deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting unit:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

module.exports = {
  getAllUnits,
  getUnitById,
  createUnit,
  updateUnit,
  deleteUnit,
};
