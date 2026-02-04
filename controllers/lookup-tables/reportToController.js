const ReportTo = require("../../models/ReportTo");
const { validationResult } = require("express-validator");

// Get all report to entries
const getAllReportTo = async (req, res) => {
  try {
    const reportToEntries = await ReportTo.findAll({
      order: [["name", "ASC"]],
    });
    res.status(200).json({
      success: true,
      data: reportToEntries,
    });
  } catch (error) {
    console.error("Error fetching report to entries:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get single report to entry by ID
const getReportToById = async (req, res) => {
  try {
    const { id } = req.params;
    const reportToEntry = await ReportTo.findByPk(id);

    if (!reportToEntry) {
      return res.status(404).json({
        success: false,
        message: "Report to entry not found",
      });
    }

    res.status(200).json({
      success: true,
      data: reportToEntry,
    });
  } catch (error) {
    console.error("Error fetching report to entry:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Create new report to entry
const createReportTo = async (req, res) => {
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
    const existingEntry = await ReportTo.findOne({ where: { name } });
    if (existingEntry) {
      return res.status(400).json({
        success: false,
        message: "Report to entry with this name already exists",
      });
    }

    const newReportTo = await ReportTo.create({
      name,
      description,
    });

    res.status(201).json({
      success: true,
      message: "Report to entry created successfully",
      data: newReportTo,
    });
  } catch (error) {
    console.error("Error creating report to entry:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Update report to entry
const updateReportTo = async (req, res) => {
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

    const reportToEntry = await ReportTo.findByPk(id);
    if (!reportToEntry) {
      return res.status(404).json({
        success: false,
        message: "Report to entry not found",
      });
    }

    // Check if name already exists (excluding current entry)
    if (name && name !== reportToEntry.name) {
      const existingEntry = await ReportTo.findOne({ where: { name } });
      if (existingEntry) {
        return res.status(400).json({
          success: false,
          message: "Report to entry with this name already exists",
        });
      }
    }

    await reportToEntry.update({
      name: name || reportToEntry.name,
      description:
        description !== undefined ? description : reportToEntry.description,
    });

    res.status(200).json({
      success: true,
      message: "Report to entry updated successfully",
      data: reportToEntry,
    });
  } catch (error) {
    console.error("Error updating report to entry:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Delete report to entry
const deleteReportTo = async (req, res) => {
  try {
    const { id } = req.params;

    const reportToEntry = await ReportTo.findByPk(id);
    if (!reportToEntry) {
      return res.status(404).json({
        success: false,
        message: "Report to entry not found",
      });
    }

    await reportToEntry.destroy();

    res.status(200).json({
      success: true,
      message: "Report to entry deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting report to entry:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

module.exports = {
  getAllReportTo,
  getReportToById,
  createReportTo,
  updateReportTo,
  deleteReportTo,
};
