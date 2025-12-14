const Relation = require("../../models/Relation");
const { validationResult } = require("express-validator");

// Get all relations
const getAllRelations = async (req, res) => {
  try {
    const relations = await Relation.findAll({
      order: [["name", "ASC"]],
      raw: true,
    });
    // Map to camelCase for frontend
    const mappedRelations = relations.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
    res.status(200).json({
      success: true,
      data: mappedRelations,
    });
  } catch (error) {
    console.error("Error fetching relations:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get single relation by ID
const getRelationById = async (req, res) => {
  try {
    const { id } = req.params;
    const relation = await Relation.findByPk(id, {
      raw: true,
    });
    if (!relation) {
      return res.status(404).json({
        success: false,
        message: "Relation not found",
      });
    }
    const mappedRelation = {
      id: relation.id,
      name: relation.name,
      description: relation.description,
      createdAt: relation.created_at,
      updatedAt: relation.updated_at,
    };
    res.status(200).json({
      success: true,
      data: mappedRelation,
    });
  } catch (error) {
    console.error("Error fetching relation:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Create new relation
const createRelation = async (req, res) => {
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

    const existingRelation = await Relation.findOne({ where: { name } });
    if (existingRelation) {
      return res.status(400).json({
        success: false,
        message: "Relation with this name already exists",
      });
    }

    const newRelation = await Relation.create({
      name,
      description,
    });

    // Fetch the created relation with raw data to get snake_case fields
    const createdRelation = await Relation.findByPk(newRelation.id, {
      raw: true,
    });

    const mappedRelation = {
      id: createdRelation.id,
      name: createdRelation.name,
      description: createdRelation.description,
      createdAt: createdRelation.created_at,
      updatedAt: createdRelation.updated_at,
    };

    res.status(201).json({
      success: true,
      message: "Relation created successfully",
      data: mappedRelation,
    });
  } catch (error) {
    console.error("Error creating relation:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Update relation
const updateRelation = async (req, res) => {
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

    const relation = await Relation.findByPk(id);
    if (!relation) {
      return res.status(404).json({
        success: false,
        message: "Relation not found",
      });
    }

    // Check if name already exists (excluding current record)
    if (name && name !== relation.name) {
      const existingRelation = await Relation.findOne({ where: { name } });
      if (existingRelation) {
        return res.status(400).json({
          success: false,
          message: "Relation with this name already exists",
        });
      }
    }

    await relation.update({
      name: name || relation.name,
      description:
        description !== undefined ? description : relation.description,
    });

    // Fetch the updated relation with raw data
    const updatedRelation = await Relation.findByPk(relation.id, {
      raw: true,
    });

    const mappedRelation = {
      id: updatedRelation.id,
      name: updatedRelation.name,
      description: updatedRelation.description,
      createdAt: updatedRelation.created_at,
      updatedAt: updatedRelation.updated_at,
    };

    res.status(200).json({
      success: true,
      message: "Relation updated successfully",
      data: mappedRelation,
    });
  } catch (error) {
    console.error("Error updating relation:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Delete relation
const deleteRelation = async (req, res) => {
  try {
    const { id } = req.params;
    const relation = await Relation.findByPk(id);
    if (!relation) {
      return res.status(404).json({
        success: false,
        message: "Relation not found",
      });
    }

    await relation.destroy();
    res.status(200).json({
      success: true,
      message: "Relation deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting relation:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

module.exports = {
  getAllRelations,
  getRelationById,
  createRelation,
  updateRelation,
  deleteRelation,
};
