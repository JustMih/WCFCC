const FunctionData = require('../../models/FunctionData');
const Function = require('../../models/Function');
const Section = require('../../models/Section');
const bcrypt = require("bcryptjs");
const { validationResult } = require("express-validator");
const { Op } = require("sequelize"); 



const getAllFunction = async (req, res) => {
  try {
    const data = await FunctionData.findAll({
      order: [['name', 'ASC']]
    });

    res.status(200).json({
      message: 'Function data fetched successfully',
      totalFunction: data.length,   // ✅ use data.length, not Function.length
      data: data                        // ✅ use the result of your query
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong', error: err.message });
  }
};

module.exports = {
  getAllFunction
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
          as: "parentFunction",
          include: [
            {
              model: Section,
              as: "section"
            }
          ]
        }
      ]
    });

    if (!functionData) {
      return res.status(404).json({ message: "Function data not found" });
    }

    if (!functionData.parentFunction) {
      return res.status(404).json({ message: "No parent function associated with this functionData." });
    }

    if (!functionData.parentFunction.section) {
      return res.status(404).json({ message: "No section found for the parent function." });
    }

    res.status(200).json({
      message: "Details fetched successfully",
      data: {
        subject: functionData.name,
        function: functionData.parentFunction.name,
        section: functionData.parentFunction.section.name
      }
    });
  } catch (err) {
    console.error("Error fetching function details:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// const getAllFunctionDetails = async (req, res) => {
//   try {
//     const functionDataId = req.params.functionId; // ✅ match route param


//     const functionData = await FunctionData.findOne({
//       where: { id: functionDataId },
//       include: [
//         {
//           model: Function,
//           as: "parentFunction",
//           include: [
//             {
//               model: Section,
//               as: "section"
//             }
//           ]
//         }
//       ]
//     });

//     if (!functionData) {
//       return res.status(404).json({ message: "Function data not found" });
//     }

//     res.status(200).json({
//       message: "Details fetched successfully",
//       data: {
//         subject: functionData.name,
//         function: functionData.function.name,
//         section: functionData.function.section.name
//       }
//     });
//   } catch (err) {
//     console.error("Error fetching function details:", err);
//     res.status(500).json({ message: "Server error", error: err.message });
//   }
// };

module.exports = {
  getByFunctionId,
  getAllFunction,
  getAllFunctionDetails
};
