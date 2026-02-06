const Subject = require("../../models/Subject");
const Unit = require("../../models/Unit");
const { validationResult } = require("express-validator");

// Get all subjects
const getAllSubjects = async (req, res) => {
  try {
    const subjects = await Subject.findAll({
      include: [
        {
          model: Unit,
          as: "unit",
          attributes: ["id", "name", "description"],
        },
      ],
      order: [["name", "ASC"]],
      raw: false,
    });
    // Map to camelCase for frontend
    const mappedSubjects = subjects.map((s) => {
      const subjectData = s.toJSON
        ? s.toJSON()
        : s.get
        ? s.get({ plain: true })
        : s;
      return {
        id: subjectData.id,
        name: subjectData.name,
        description: subjectData.description,
        unit_id: subjectData.unit_id,
        unit: subjectData.unit,
        createdAt: subjectData.created_at || subjectData.createdAt,
        updatedAt: subjectData.updated_at || subjectData.updatedAt,
      };
    });
    res.status(200).json({
      success: true,
      data: mappedSubjects,
    });
  } catch (error) {
    console.error("Error fetching subjects:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get single subject by ID
const getSubjectById = async (req, res) => {
  try {
    const { id } = req.params;
    const subject = await Subject.findByPk(id, {
      include: [
        {
          model: Unit,
          as: "unit",
          attributes: ["id", "name", "description"],
        },
      ],
    });
    if (!subject) {
      return res.status(404).json({
        success: false,
        message: "Subject not found",
      });
    }
    const subjectData = subject.toJSON
      ? subject.toJSON()
      : subject.get
      ? subject.get({ plain: true })
      : subject;
    const mappedSubject = {
      id: subjectData.id,
      name: subjectData.name,
      description: subjectData.description,
      unit_id: subjectData.unit_id,
      unit: subjectData.unit,
      createdAt: subjectData.created_at || subjectData.createdAt,
      updatedAt: subjectData.updated_at || subjectData.updatedAt,
    };
    res.status(200).json({
      success: true,
      data: mappedSubject,
    });
  } catch (error) {
    console.error("Error fetching subject:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Create new subject
const createSubject = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors: errors.array(),
      });
    }

    const { name, description, unit_id } = req.body;

    if (!unit_id) {
      return res.status(400).json({
        success: false,
        message: "unit_id is required",
      });
    }

    const existingSubject = await Subject.findOne({ where: { name } });
    if (existingSubject) {
      return res.status(400).json({
        success: false,
        message: "Subject with this name already exists",
      });
    }

    // Validate unit_id
    const unit = await Unit.findByPk(unit_id);
    if (!unit) {
      return res.status(400).json({
        success: false,
        message: "Unit not found",
      });
    }

    const newSubject = await Subject.create({
      name,
      description,
      unit_id,
    });

    const subjectWithUnit = await Subject.findByPk(newSubject.id, {
      include: [
        {
          model: Unit,
          as: "unit",
          attributes: ["id", "name", "description"],
        },
      ],
    });

    const subjectData = subjectWithUnit.toJSON
      ? subjectWithUnit.toJSON()
      : subjectWithUnit.get
      ? subjectWithUnit.get({ plain: true })
      : subjectWithUnit;
    const mappedSubject = {
      id: subjectData.id,
      name: subjectData.name,
      description: subjectData.description,
      unit_id: subjectData.unit_id,
      unit: subjectData.unit,
      createdAt: subjectData.created_at || subjectData.createdAt,
      updatedAt: subjectData.updated_at || subjectData.updatedAt,
    };

    res.status(201).json({
      success: true,
      message: "Subject created successfully",
      data: mappedSubject,
    });
  } catch (error) {
    console.error("Error creating subject:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Update subject
const updateSubject = async (req, res) => {
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
    const { name, description, unit_id } = req.body;

    const subject = await Subject.findByPk(id);
    if (!subject) {
      return res.status(404).json({
        success: false,
        message: "Subject not found",
      });
    }

    if (name && name !== subject.name) {
      const existingSubject = await Subject.findOne({ where: { name } });
      if (existingSubject) {
        return res.status(400).json({
          success: false,
          message: "Subject with this name already exists",
        });
      }
    }

    // Validate unit_id if provided
    if (unit_id !== undefined && unit_id !== subject.unit_id) {
      const unit = await Unit.findByPk(unit_id);
      if (!unit) {
        return res.status(400).json({
          success: false,
          message: "Unit not found",
        });
      }
    }

    await subject.update({
      name: name || subject.name,
      description:
        description !== undefined ? description : subject.description,
      unit_id: unit_id !== undefined ? unit_id : subject.unit_id,
    });

    const updatedSubject = await Subject.findByPk(subject.id, {
      include: [
        {
          model: Unit,
          as: "unit",
          attributes: ["id", "name", "description"],
        },
      ],
    });

    const subjectData = updatedSubject.toJSON
      ? updatedSubject.toJSON()
      : updatedSubject.get
      ? updatedSubject.get({ plain: true })
      : updatedSubject;
    const mappedSubject = {
      id: subjectData.id,
      name: subjectData.name,
      description: subjectData.description,
      unit_id: subjectData.unit_id,
      unit: subjectData.unit,
      createdAt: subjectData.created_at || subjectData.createdAt,
      updatedAt: subjectData.updated_at || subjectData.updatedAt,
    };

    res.status(200).json({
      success: true,
      message: "Subject updated successfully",
      data: mappedSubject,
    });
  } catch (error) {
    console.error("Error updating subject:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Delete subject
const deleteSubject = async (req, res) => {
  try {
    const { id } = req.params;
    const subject = await Subject.findByPk(id);
    if (!subject) {
      return res.status(404).json({
        success: false,
        message: "Subject not found",
      });
    }

    await subject.destroy();
    res.status(200).json({
      success: true,
      message: "Subject deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting subject:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

module.exports = {
  getAllSubjects,
  getSubjectById,
  createSubject,
  updateSubject,
  deleteSubject,
};
