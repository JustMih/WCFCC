 const { IVRDTMFMapping, IVRAction, IVRVoice } = require("../../models");

/**
 * ADD / UPDATE DTMF MAPPINGS
 * - Saves ONLY real actions
 * - Skips invalid_option
 * - Enforces uniqueness by (menu_context, language, dtmf_digit)
 */
const addIVRDTMFMapping = async (req, res) => {
  try {
    const { mappings } = req.body;

    if (!Array.isArray(mappings)) {
      return res.status(400).json({
        message: "Mappings Error: mappings should be an array.",
      });
    }

    // 🔐 Get invalid_option action ONCE
    const invalidAction = await IVRAction.findOne({
      where: { name: "invalid_option" },
    });
    const INVALID_ACTION_ID = invalidAction?.id;

    const results = [];
    const skipped = [];

    for (const m of mappings) {
      // ❌ Skip incomplete rows
      if (
        !m.dtmf_digit ||
        !m.action_id ||
        !m.ivr_voice_id ||
        !m.language ||
        isNaN(Number(m.action_id))
      ) {
        skipped.push({ dtmf_digit: m?.dtmf_digit, reason: "incomplete" });
        continue;
      }

      // ❌ NEVER persist invalid_option
      if (Number(m.action_id) === Number(INVALID_ACTION_ID)) {
        skipped.push({
          dtmf_digit: m.dtmf_digit,
          reason: "invalid_option not persisted",
        });
        continue;
      }

      const menuContext =
        m.menu_context && m.menu_context.trim() !== ""
          ? m.menu_context
          : "general";

      /**
       * 🔑 IMPORTANT:
       * Asterisk resolves IVR ONLY by:
       *   dtmf_digit + menu_context + language
       * ivr_voice_id must NOT be part of uniqueness
       */
      const existing = await IVRDTMFMapping.findOne({
        where: {
          dtmf_digit: m.dtmf_digit,
          language: m.language,
          menu_context: menuContext,
        },
      });

      if (existing) {
        // ✅ UPDATE EXISTING
        existing.action_id = m.action_id;
        existing.parameter = m.parameter;
        existing.ivr_voice_id = m.ivr_voice_id;

        await existing.save();

        results.push({
          id: existing.id,
          dtmf_digit: m.dtmf_digit,
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
          dtmf_digit: m.dtmf_digit,
          status: "created",
        });
      }
    }

    return res.status(200).json({
      message: "IVR mappings processed successfully",
      results,
      skipped,
    });

  } catch (error) {
    console.error("🔥 Failed to insert mappings:", error);
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * GET MAPPINGS BY VOICE
 */
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
        { model: IVRAction, as: "action", attributes: ["name"] },
        { model: IVRVoice, as: "voice", attributes: ["file_name"] },
      ],
      order: [["dtmf_digit", "ASC"]],
    });

    res.status(200).json(mappings);
  } catch (error) {
    console.error("Error fetching mappings:", error);
    res.status(500).json({
      message: "Fetch error",
      error: error.message,
    });
  }
};

/**
 * GET ALL MAPPINGS
 */
const getAllMappings = async (req, res) => {
  try {
    const mappings = await IVRDTMFMapping.findAll({
      order: [["menu_context", "ASC"], ["language", "ASC"], ["dtmf_digit", "ASC"]],
    });

    res.status(200).json(mappings);
  } catch (error) {
    console.error("Error fetching mappings:", error);
    res.status(500).json({
      message: "Fetch error",
      error: error.message,
    });
  }
};

/**
 * DELETE MAPPING
 */
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
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

 
/**
 * UPDATE SINGLE MAPPING (FULL EDIT)
 * - Allows changing dtmf_digit
 * - Allows changing ivr_voice_id
 * - Enforces UNIQUE(menu_context, language, dtmf_digit)
 */
const updateMapping = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      dtmf_digit,
      parameter,
      action_id,
      ivr_voice_id,
      language,
      menu_context
    } = req.body;

    const mapping = await IVRDTMFMapping.findByPk(id);
    if (!mapping) {
      return res.status(404).json({ message: "Mapping not found" });
    }

    // 🔐 Block invalid_option edits
    const invalidAction = await IVRAction.findOne({
      where: { name: "invalid_option" },
    });
    if (
      invalidAction &&
      Number(action_id) === Number(invalidAction.id)
    ) {
      return res.status(400).json({
        message: "invalid_option cannot be persisted",
      });
    }

    const newDTMF = dtmf_digit ?? mapping.dtmf_digit;
    const newLang = language ?? mapping.language;
    const newMenu =
      menu_context && menu_context.trim() !== ""
        ? menu_context
        : mapping.menu_context;

    // 🔎 Uniqueness check IF digit/menu/lang changes
    if (
      newDTMF !== mapping.dtmf_digit ||
      newLang !== mapping.language ||
      newMenu !== mapping.menu_context
    ) {
      const conflict = await IVRDTMFMapping.findOne({
        where: {
          dtmf_digit: newDTMF,
          language: newLang,
          menu_context: newMenu,
        },
      });

      if (conflict && conflict.id !== mapping.id) {
        return res.status(409).json({
          message:
            `DTMF ${newDTMF} already exists for ${newMenu} (${newLang})`,
        });
      }
    }

    // ✅ Apply updates
    if (dtmf_digit !== undefined) mapping.dtmf_digit = dtmf_digit;
    if (parameter !== undefined) mapping.parameter = parameter;
    if (action_id !== undefined && !isNaN(Number(action_id)))
      mapping.action_id = action_id;
    if (ivr_voice_id !== undefined)
      mapping.ivr_voice_id = ivr_voice_id;
    if (language !== undefined) mapping.language = language;
    if (menu_context !== undefined)
      mapping.menu_context = newMenu;

    await mapping.save();

    const updated = await IVRDTMFMapping.findByPk(id, {
      include: [
        { model: IVRAction, as: "action", attributes: ["name"] },
        { model: IVRVoice, as: "voice", attributes: ["file_name"] },
      ],
    });

    return res.status(200).json({
      message: "Mapping updated successfully",
      mapping: updated,
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
  updateMapping,
};
