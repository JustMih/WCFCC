const FunctionData = require('../../models/FunctionData');
const Function = require('../../models/Function');
const Section = require('../../models/Section');
const bcrypt = require("bcryptjs");
const { validationResult } = require("express-validator");
const { Op } = require("sequelize"); 


const getAllFunction = async (req, res) => {
  try {
    // Get all sections (directorates and units)
    const allSections = await Section.findAll({
      order: [['name', 'ASC']]
    });

    // Find the "Units" section (note: it's "Units" plural, not "Unit")
    const unitSection = await Section.findOne({
      where: { name: 'Units' }
    });

    console.log('DEBUG: Unit section found:', unitSection ? unitSection.name : 'Not found');

    let sectionsList = [...allSections];

    // If "Units" section exists, get all functions that belong to it
    if (unitSection) {
      const unitFunctions = await Function.findAll({
        where: { section_id: unitSection.id },
        order: [['name', 'ASC']],
        attributes: ['id', 'name', 'section_id', 'created_at', 'updated_at']
      });

      console.log('DEBUG: Unit functions found:', unitFunctions.length, unitFunctions.map(f => f.name));

      // Add functions as sections (so "ICT Unit" appears as a section)
      unitFunctions.forEach(func => {
        sectionsList.push({
          id: func.id,
          name: func.name, // e.g., "ICT Unit"
          section_id: func.section_id,
          created_at: func.created_at,
          updated_at: func.updated_at
        });
      });
    } else {
      console.log('DEBUG: Unit section not found, trying case-insensitive search...');
      // Try case-insensitive search - get all sections and find one with "unit" in name
      const allSectionsForSearch = await Section.findAll();
      const unitSectionFound = allSectionsForSearch.find(s => 
        s.name.toLowerCase().includes('unit')
      );
      
      if (unitSectionFound) {
        console.log('DEBUG: Found unit section with case-insensitive:', unitSectionFound.name);
        const unitFunctions = await Function.findAll({
          where: { section_id: unitSectionFound.id },
          order: [['name', 'ASC']],
          attributes: ['id', 'name', 'section_id', 'created_at', 'updated_at']
        });

        console.log('DEBUG: Unit functions found:', unitFunctions.length, unitFunctions.map(f => f.name));

        unitFunctions.forEach(func => {
          sectionsList.push({
            id: func.id,
            name: func.name,
            section_id: func.section_id,
            created_at: func.created_at,
            updated_at: func.updated_at
          });
        });
      } else {
        console.log('DEBUG: No unit section found at all');
      }
    }

    // Remove the generic "Units" section from the list (we only want specific units like "ICT Unit")
    sectionsList = sectionsList.filter(section => 
      section.name !== 'Unit' && section.name !== 'Units'
    );

    // Sort by name
    sectionsList.sort((a, b) => a.name.localeCompare(b.name));

    res.status(200).json({
      message: 'Units data fetched successfully',
      totalFunction: sectionsList.length,
      data: sectionsList
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong', error: err.message });
  }
};


const getAllFunctionData = async (req, res) => {
  try {
    const data = await FunctionData.findAll({
      order: [['name', 'ASC']],
      include: [
        {
          model: Function,
          as: 'function',
          include: [
            {
              model: Section,
              as: 'section'
            },
            {
              model: FunctionData,
              as: 'functionData',
              include: [
                
              ]
            }
          ]
        }
      ]
    });

    res.status(200).json({
      message: 'Function data fetched successfully',
      totalFunction: data.length,
      data: data
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong', error: err.message });
  }
};


const getByFunctionId = async (req, res) => {
  try {
    const functionId = req.params.functionId;

    const data = await Function.findAll({
      where: { function_id: functionId },
      order: [['name', 'ASC']]
    });

    res.status(200).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong' });
  }
};

const getAllFunctionDetails = async (req, res) => {
  try {
    const functionDataId = req.params.functionId;

    const functionData = await FunctionData.findOne({
      where: { id: functionDataId },
      include: [
        {
          model: Function,
          as: 'function',
          include: [
            {
              model: Section,
              as: 'section'
            }
          ]
        }
      ]
    });

    if (!functionData) {
      return res.status(404).json({ message: "Function data not found" });
    }

    if (!functionData.function) {
      return res.status(404).json({ message: "No parent function associated with this functionData." });
    }

    if (!functionData.function.section) {
      return res.status(404).json({ message: "No section found for the parent function." });
    }

    res.status(200).json({
      message: "Details fetched successfully",
      data: {
        subject: functionData.name,
        function: functionData.function.name,
        section: functionData.function.section.name
      }
    });
  } catch (err) {
    console.error("Error fetching function details:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};




// Mapping endpoints for superadmin frontend
const getSectionsMapping = async (req, res) => {
  try {
    const sections = await Section.findAll({
      order: [['name', 'ASC']],
      include: [
        {
          model: Function,
          as: 'functions',
          separate: true,
          order: [['name', 'ASC']],
          include: [
            {
              model: FunctionData,
              as: 'functionData',
              separate: true,
              order: [['name', 'ASC']],
              attributes: ['id', 'name', 'function_id', 'created_at', 'updated_at']
            }
          ],
          attributes: ['id', 'name', 'section_id', 'created_at', 'updated_at']
        }
      ],
      attributes: ['id', 'name', 'created_at', 'updated_at']
    });

    // Format for frontend mapping
    const mappedData = sections.map(section => ({
      id: section.id,
      name: section.name,
      createdAt: section.created_at,
      updatedAt: section.updated_at,
      functions: (section.functions || []).sort((a, b) => a.name.localeCompare(b.name)).map(func => ({
        id: func.id,
        name: func.name,
        sectionId: func.section_id,
        createdAt: func.created_at,
        updatedAt: func.updated_at,
        functionData: (func.functionData || []).sort((a, b) => a.name.localeCompare(b.name)).map(fd => ({
          id: fd.id,
          name: fd.name,
          functionId: fd.function_id,
          createdAt: fd.created_at,
          updatedAt: fd.updated_at
        }))
      }))
    }));

    res.status(200).json({
      success: true,
      message: 'Sections mapping fetched successfully',
      totalSections: mappedData.length,
      data: mappedData
    });
  } catch (err) {
    console.error("Error fetching sections mapping:", err);
    res.status(500).json({ 
      success: false,
      message: 'Something went wrong', 
      error: err.message 
    });
  }
};

const getFunctionsMapping = async (req, res) => {
  try {
    const functions = await Function.findAll({
      order: [['name', 'ASC']],
      include: [
        {
          model: Section,
          as: 'section',
          attributes: ['id', 'name', 'created_at', 'updated_at']
        },
        {
          model: FunctionData,
          as: 'functionData',
          separate: true,
          order: [['name', 'ASC']],
          attributes: ['id', 'name', 'function_id', 'created_at', 'updated_at']
        }
      ],
      attributes: ['id', 'name', 'section_id', 'created_at', 'updated_at']
    });

    // Format for frontend mapping
    const mappedData = functions.map(func => ({
      id: func.id,
      name: func.name,
      sectionId: func.section_id,
      createdAt: func.created_at,
      updatedAt: func.updated_at,
      section: func.section ? {
        id: func.section.id,
        name: func.section.name,
        createdAt: func.section.created_at,
        updatedAt: func.section.updated_at
      } : null,
      functionData: (func.functionData || []).sort((a, b) => a.name.localeCompare(b.name)).map(fd => ({
        id: fd.id,
        name: fd.name,
        functionId: fd.function_id,
        createdAt: fd.created_at,
        updatedAt: fd.updated_at
      }))
    }));

    res.status(200).json({
      success: true,
      message: 'Functions mapping fetched successfully',
      totalFunctions: mappedData.length,
      data: mappedData
    });
  } catch (err) {
    console.error("Error fetching functions mapping:", err);
    res.status(500).json({ 
      success: false,
      message: 'Something went wrong', 
      error: err.message 
    });
  }
};

const getFunctionDataMapping = async (req, res) => {
  try {
    const functionData = await FunctionData.findAll({
      order: [['name', 'ASC']],
      include: [
        {
          model: Function,
          as: 'function',
          include: [
            {
              model: Section,
              as: 'section',
              attributes: ['id', 'name', 'created_at', 'updated_at']
            }
          ],
          attributes: ['id', 'name', 'section_id', 'created_at', 'updated_at']
        }
      ],
      attributes: ['id', 'name', 'function_id', 'created_at', 'updated_at']
    });

    // Format for frontend mapping
    const mappedData = functionData.map(fd => ({
      id: fd.id,
      name: fd.name,
      functionId: fd.function_id,
      createdAt: fd.created_at,
      updatedAt: fd.updated_at,
      function: fd.function ? {
        id: fd.function.id,
        name: fd.function.name,
        sectionId: fd.function.section_id,
        createdAt: fd.function.created_at,
        updatedAt: fd.function.updated_at,
        section: fd.function.section ? {
          id: fd.function.section.id,
          name: fd.function.section.name,
          createdAt: fd.function.section.created_at,
          updatedAt: fd.function.section.updated_at
        } : null
      } : null
    }));

    res.status(200).json({
      success: true,
      message: 'Function data mapping fetched successfully',
      totalFunctionData: mappedData.length,
      data: mappedData
    });
  } catch (err) {
    console.error("Error fetching function data mapping:", err);
    res.status(500).json({ 
      success: false,
      message: 'Something went wrong', 
      error: err.message 
    });
  }
};

// Combined mapping endpoint - returns all three in one response
const getAllMappings = async (req, res) => {
  try {
    const [sections, functions, functionData] = await Promise.all([
      Section.findAll({
        order: [['name', 'ASC']],
        include: [
          {
            model: Function,
            as: 'functions',
            separate: true,
            order: [['name', 'ASC']],
            include: [
              {
                model: FunctionData,
                as: 'functionData',
                separate: true,
                order: [['name', 'ASC']],
                attributes: ['id', 'name', 'function_id', 'created_at', 'updated_at']
              }
            ],
            attributes: ['id', 'name', 'section_id', 'created_at', 'updated_at']
          }
        ],
        attributes: ['id', 'name', 'created_at', 'updated_at']
      }),
      Function.findAll({
        order: [['name', 'ASC']],
        include: [
          {
            model: Section,
            as: 'section',
            attributes: ['id', 'name', 'created_at', 'updated_at']
          },
          {
            model: FunctionData,
            as: 'functionData',
            separate: true,
            order: [['name', 'ASC']],
            attributes: ['id', 'name', 'function_id', 'created_at', 'updated_at']
          }
        ],
        attributes: ['id', 'name', 'section_id', 'created_at', 'updated_at']
      }),
      FunctionData.findAll({
        order: [['name', 'ASC']],
        include: [
          {
            model: Function,
            as: 'function',
            include: [
              {
                model: Section,
                as: 'section',
                attributes: ['id', 'name', 'created_at', 'updated_at']
              }
            ],
            attributes: ['id', 'name', 'section_id', 'created_at', 'updated_at']
          }
        ],
        attributes: ['id', 'name', 'function_id', 'created_at', 'updated_at']
      })
    ]);

    // Format sections mapping
    const sectionsMapping = sections.map(section => ({
      id: section.id,
      name: section.name,
      createdAt: section.created_at,
      updatedAt: section.updated_at,
      functions: (section.functions || []).sort((a, b) => a.name.localeCompare(b.name)).map(func => ({
        id: func.id,
        name: func.name,
        sectionId: func.section_id,
        createdAt: func.created_at,
        updatedAt: func.updated_at,
        functionData: (func.functionData || []).sort((a, b) => a.name.localeCompare(b.name)).map(fd => ({
          id: fd.id,
          name: fd.name,
          functionId: fd.function_id,
          createdAt: fd.created_at,
          updatedAt: fd.updated_at
        }))
      }))
    }));

    // Format functions mapping
    const functionsMapping = functions.map(func => ({
      id: func.id,
      name: func.name,
      sectionId: func.section_id,
      createdAt: func.created_at,
      updatedAt: func.updated_at,
      section: func.section ? {
        id: func.section.id,
        name: func.section.name,
        createdAt: func.section.created_at,
        updatedAt: func.section.updated_at
      } : null,
      functionData: (func.functionData || []).sort((a, b) => a.name.localeCompare(b.name)).map(fd => ({
        id: fd.id,
        name: fd.name,
        functionId: fd.function_id,
        createdAt: fd.created_at,
        updatedAt: fd.updated_at
      }))
    }));

    // Format function data mapping
    const functionDataMapping = functionData.map(fd => ({
      id: fd.id,
      name: fd.name,
      functionId: fd.function_id,
      createdAt: fd.created_at,
      updatedAt: fd.updated_at,
      function: fd.function ? {
        id: fd.function.id,
        name: fd.function.name,
        sectionId: fd.function.section_id,
        createdAt: fd.function.created_at,
        updatedAt: fd.function.updated_at,
        section: fd.function.section ? {
          id: fd.function.section.id,
          name: fd.function.section.name,
          createdAt: fd.function.section.created_at,
          updatedAt: fd.function.section.updated_at
        } : null
      } : null
    }));

    res.status(200).json({
      success: true,
      message: 'All mappings fetched successfully',
      data: {
        sections: {
          total: sectionsMapping.length,
          data: sectionsMapping
        },
        functions: {
          total: functionsMapping.length,
          data: functionsMapping
        },
        functionData: {
          total: functionDataMapping.length,
          data: functionDataMapping
        }
      }
    });
  } catch (err) {
    console.error("Error fetching all mappings:", err);
    res.status(500).json({ 
      success: false,
      message: 'Something went wrong', 
      error: err.message 
    });
  }
};

// ========== SECTION CRUD OPERATIONS ==========

// Create Section
const createSection = async (req, res) => {
  try {
    const { name } = req.body;
    const userId = req.user?.id || req.user?.userId || req.user?.user_id; // Get from auth middleware

    if (!name || name.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Section name is required",
      });
    }

    const section = await Section.create({
      name: name.trim(),
      created_by: userId,
      updated_by: userId,
    });

    res.status(201).json({
      success: true,
      message: "Section created successfully",
      data: section,
    });
  } catch (err) {
    console.error("Error creating section:", err);
    res.status(500).json({
      success: false,
      message: "Failed to create section",
      error: err.message,
    });
  }
};

// Update Section
const updateSection = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;

    if (!name || name.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Section name is required",
      });
    }

    const section = await Section.findByPk(id);
    if (!section) {
      return res.status(404).json({
        success: false,
        message: "Section not found",
      });
    }

    await section.update({
      name: name.trim(),
      updated_by: userId,
    });

    res.status(200).json({
      success: true,
      message: "Section updated successfully",
      data: section,
    });
  } catch (err) {
    console.error("Error updating section:", err);
    res.status(500).json({
      success: false,
      message: "Failed to update section",
      error: err.message,
    });
  }
};

// Delete Section
const deleteSection = async (req, res) => {
  try {
    const { id } = req.params;

    const section = await Section.findByPk(id);
    if (!section) {
      return res.status(404).json({
        success: false,
        message: "Section not found",
      });
    }

    // Check if section has functions
    const functionsCount = await Function.count({
      where: { section_id: id },
    });

    if (functionsCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete section. It has ${functionsCount} function(s) associated with it. Please delete or reassign functions first.`,
      });
    }

    await section.destroy();

    res.status(200).json({
      success: true,
      message: "Section deleted successfully",
    });
  } catch (err) {
    console.error("Error deleting section:", err);
    res.status(500).json({
      success: false,
      message: "Failed to delete section",
      error: err.message,
    });
  }
};

// ========== FUNCTION CRUD OPERATIONS ==========

// Create Function
const createFunction = async (req, res) => {
  try {
    const { name, section_id } = req.body;
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;

    if (!name || name.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Function name is required",
      });
    }

    if (!section_id) {
      return res.status(400).json({
        success: false,
        message: "Section ID is required",
      });
    }

    // Verify section exists
    const section = await Section.findByPk(section_id);
    if (!section) {
      return res.status(404).json({
        success: false,
        message: "Section not found",
      });
    }

    const func = await Function.create({
      name: name.trim(),
      section_id,
      created_by: userId,
      updated_by: userId,
    });

    res.status(201).json({
      success: true,
      message: "Function created successfully",
      data: func,
    });
  } catch (err) {
    console.error("Error creating function:", err);
    res.status(500).json({
      success: false,
      message: "Failed to create function",
      error: err.message,
    });
  }
};

// Update Function
const updateFunction = async (req, res) => {
  try {
    console.log("🔄 PUT /functions/:id called with:", { 
      id: req.params.id, 
      body: req.body,
      user: req.user?.id || req.user?.userId 
    });
    const { id } = req.params;
    const { name, section_id } = req.body;
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;

    if (!name || name.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Function name is required",
      });
    }

    const func = await Function.findByPk(id);
    if (!func) {
      return res.status(404).json({
        success: false,
        message: "Function not found",
      });
    }

    // If section_id is provided, verify it exists
    if (section_id) {
      const section = await Section.findByPk(section_id);
      if (!section) {
        return res.status(404).json({
          success: false,
          message: "Section not found",
        });
      }
    }

    await func.update({
      name: name.trim(),
      ...(section_id && { section_id }),
      updated_by: userId,
    });

    res.status(200).json({
      success: true,
      message: "Function updated successfully",
      data: func,
    });
  } catch (err) {
    console.error("Error updating function:", err);
    res.status(500).json({
      success: false,
      message: "Failed to update function",
      error: err.message,
    });
  }
};

// Delete Function
const deleteFunction = async (req, res) => {
  try {
    const { id } = req.params;

    const func = await Function.findByPk(id);
    if (!func) {
      return res.status(404).json({
        success: false,
        message: "Function not found",
      });
    }

    // Check if function has function data
    const functionDataCount = await FunctionData.count({
      where: { function_id: id },
    });

    if (functionDataCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete function. It has ${functionDataCount} function data item(s) associated with it. Please delete or reassign function data first.`,
      });
    }

    await func.destroy();

    res.status(200).json({
      success: true,
      message: "Function deleted successfully",
    });
  } catch (err) {
    console.error("Error deleting function:", err);
    res.status(500).json({
      success: false,
      message: "Failed to delete function",
      error: err.message,
    });
  }
};

// ========== FUNCTION DATA CRUD OPERATIONS ==========

// Create Function Data
const createFunctionData = async (req, res) => {
  try {
    const { name, function_id } = req.body;
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;

    if (!name || name.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Function data name is required",
      });
    }

    if (!function_id) {
      return res.status(400).json({
        success: false,
        message: "Function ID is required",
      });
    }

    // Verify function exists
    const func = await Function.findByPk(function_id);
    if (!func) {
      return res.status(404).json({
        success: false,
        message: "Function not found",
      });
    }

    const functionData = await FunctionData.create({
      name: name.trim(),
      function_id,
      created_by: userId,
      updated_by: userId,
    });

    res.status(201).json({
      success: true,
      message: "Function data created successfully",
      data: functionData,
    });
  } catch (err) {
    console.error("Error creating function data:", err);
    res.status(500).json({
      success: false,
      message: "Failed to create function data",
      error: err.message,
    });
  }
};

// Update Function Data
const updateFunctionData = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, function_id } = req.body;
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;

    if (!name || name.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Function data name is required",
      });
    }

    const functionData = await FunctionData.findByPk(id);
    if (!functionData) {
      return res.status(404).json({
        success: false,
        message: "Function data not found",
      });
    }

    // If function_id is provided, verify it exists
    if (function_id) {
      const func = await Function.findByPk(function_id);
      if (!func) {
        return res.status(404).json({
          success: false,
          message: "Function not found",
        });
      }
    }

    await functionData.update({
      name: name.trim(),
      ...(function_id && { function_id }),
      updated_by: userId,
    });

    res.status(200).json({
      success: true,
      message: "Function data updated successfully",
      data: functionData,
    });
  } catch (err) {
    console.error("Error updating function data:", err);
    res.status(500).json({
      success: false,
      message: "Failed to update function data",
      error: err.message,
    });
  }
};

// Delete Function Data
const deleteFunctionData = async (req, res) => {
  try {
    const { id } = req.params;

    const functionData = await FunctionData.findByPk(id);
    if (!functionData) {
      return res.status(404).json({
        success: false,
        message: "Function data not found",
      });
    }

    await functionData.destroy();

    res.status(200).json({
      success: true,
      message: "Function data deleted successfully",
    });
  } catch (err) {
    console.error("Error deleting function data:", err);
    res.status(500).json({
      success: false,
      message: "Failed to delete function data",
      error: err.message,
    });
  }
};

module.exports = {
  getByFunctionId,
  getAllFunctionData,
  getAllFunctionDetails,
  getAllFunction,
  getSectionsMapping,
  getFunctionsMapping,
  getFunctionDataMapping,
  getAllMappings,
  // Section CRUD
  createSection,
  updateSection,
  deleteSection,
  // Function CRUD
  createFunction,
  updateFunction,
  deleteFunction,
  // Function Data CRUD
  createFunctionData,
  updateFunctionData,
  deleteFunctionData,
};
