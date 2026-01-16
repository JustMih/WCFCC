const { IVRDTMFMapping, IVRAction, IVRVoice } = require("../../models");
 
const addIVRDTMFMapping = async (req, res) => {
  try {
    const { mappings } = req.body;

    if (!Array.isArray(mappings)) {
      return res.status(400).json({
        message: "Mappings Error: mappings should be an array.",
      });
    }

    const results = [];
    const skipped = [];

    for (const m of mappings) {
      if (
        !m.dtmf_digit ||
        !m.action_id ||
        !m.ivr_voice_id ||
        !m.language ||
        isNaN(Number(m.action_id))
      ) {
        continue;
      }

      const menuContext =
        m.menu_context && m.menu_context.trim() !== ""
          ? m.menu_context
          : "general";

      // 🔴 CHECK IF MAPPING ALREADY EXISTS
      const existing = await IVRDTMFMapping.findOne({
        where: {
          dtmf_digit: m.dtmf_digit,
          ivr_voice_id: m.ivr_voice_id,
          language: m.language,
          menu_context: menuContext,
        },
      });

      if (existing) {
        // ✅ UPDATE EXISTING
        existing.action_id = m.action_id;
        existing.parameter = m.parameter;
        await existing.save();

        results.push({
          id: existing.id,
          status: "updated",
        });
      } else {
        // ✅ INSERT NEW
        const created = await IVRDTMFMapping.create({
          dtmf_digit: m.dtmf_digit,
          action_id: m.action_id,
          parameter: m.parameter,
          ivr_voice_id: m.ivr_voice_id,
          language: m.language,
          menu_context: menuContext,
        });

        results.push({
          id: created.id,
          status: "created",
        });
      }
    }

    return res.status(200).json({
      message:
        "IVR Settings. Updated, New added.",
      results,
    });
} catch (error) {
  if (error.name === "SequelizeUniqueConstraintError") {
    return res.status(409).json({
      message:
        "Settings arleady exist.",
    });
  }

  console.error("🔥 Failed to insert mappings:", error);
  return res.status(500).json({
    message: "Server error",
    error: error.message,
  });
}

};


const getMappingsByVoice = async (req, res) => {
  try {
    const { ivr_voice_id } = req.params;
    
    const { language, menu_context } = req.query;

      const whereClause = { ivr_voice_id };

      if (language) whereClause.language = language;
      if (menu_context) whereClause.menu_context = menu_context;


    const mappings = await IVRDTMFMapping.findAll({
      where: whereClause,
      include: [
        { model: IVRAction, as: 'action', attributes: ['name'] },
        { model: IVRVoice, as: 'voice', attributes: ['file_name'] }
      ],
      order: [["dtmf_digit", "ASC"]]
    });

    res.status(200).json(mappings);
  } catch (error) {
    console.error("Error fetching mappings:", error);
    res.status(500).json({ message: "Fetch error", error: error.message });
  }
};

const getAllMappings = async (req, res) => {
  try {
    const mappings = await IVRDTMFMapping.findAll({
      order: [["dtmf_digit", "ASC"]]  
    });
    res.status(200).json(mappings);
  } catch (error) {
    console.error("Error fetching mappings:", error);
    res.status(500).json({ message: "Fetch error", error: error.message });
  }
};

const deleteMapping = async (req, res) => {
  try {
    const { id } = req.params;
    const mapping = await IVRDTMFMapping.findByPk(id);
    if (!mapping) {
      return res.status(404).json({ message: "Mapping not found" });
    }
    await mapping.destroy();
    res.status(200).json({ message: "Mapping deleted" });
  } catch (error) {
    console.error("Error deleting mapping:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
 
const updateMapping = async (req, res) => {
  try {
    const { id } = req.params;

    // Allow updating multiple fields (partial update)
    const {
      parameter,
      action_id,
      language,
      menu_context
    } = req.body;

    // Find mapping
    const mapping = await IVRDTMFMapping.findByPk(id);
    if (!mapping) {
      return res.status(404).json({ message: "Mapping not found" });
    }

    // Update ONLY provided fields (safe updates)
    if (parameter !== undefined) {
      mapping.parameter = parameter;
    }

    if (action_id !== undefined && !isNaN(Number(action_id))) {
      mapping.action_id = action_id;
    }

    if (language !== undefined && typeof language === "string") {
      mapping.language = language;
    }

    if (menu_context !== undefined && typeof menu_context === "string") {
      mapping.menu_context =
        menu_context.trim() !== "" ? menu_context : "general";
    }

    // Save changes
    await mapping.save();

    // Fetch updated mapping with relations
    const updatedMapping = await IVRDTMFMapping.findByPk(id, {
      include: [
        { model: IVRAction, as: "action", attributes: ["name"] },
        { model: IVRVoice, as: "voice", attributes: ["file_name"] },
      ],
    });

    return res.status(200).json({
      message: "Mapping updated successfully",
      mapping: updatedMapping,
    });

  } catch (error) {
    console.error("Error updating mapping:", error);
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

module.exports = {
  addIVRDTMFMapping,
  getMappingsByVoice,
  getAllMappings,
  deleteMapping,
  updateMapping
};
