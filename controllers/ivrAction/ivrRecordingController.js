const sequelize = require("../../config/mysql_connection");
const VoiceNote = require("../../models/voice_notes.model");
const User = require("../../models/User");

const PRIVILEGED_VOICE_NOTE_ROLES = new Set([
  "super-admin",
  "admin",
  "supervisor",
  "director",
  "director-general",
  "manager",
]);

const VOICE_NOTE_SELECT = `
SELECT 
  vn.id,
  vn.recording_path,
  CONCAT(
    'custom/',
    SUBSTRING_INDEX(
      SUBSTRING_INDEX(vn.recording_path, '/', -1),
      '.',
      1
    ),
    '.wav'
  ) AS playable_path,
  vn.clid,
  vn.assigned_extension,
  vn.assigned_agent_id,
  COALESCE(u_agent.full_name, u_ext.full_name) AS assigned_agent_name,
  vn.is_played,
  vn.duration_seconds,
  vn.transcription,
  vn.status,
  vn.created_at
FROM Voice_Notes vn
LEFT JOIN Users u_agent ON u_agent.id = vn.assigned_agent_id
LEFT JOIN Users u_ext ON u_ext.extension = vn.assigned_extension
`;

const getAllVoiceNotes = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const role = req.user?.role || "";
    const queryAgentId = req.query.agentId
      ? String(req.query.agentId).trim()
      : "";
    const queryExtension = req.query.extension
      ? String(req.query.extension).trim()
      : "";

    const isPrivileged = PRIVILEGED_VOICE_NOTE_ROLES.has(role);
    let whereSql = "";
    const replacements = {};

    if (isPrivileged && !queryAgentId && !queryExtension) {
      // Supervisors/admins: all voice notes when no filter requested
      whereSql = "";
    } else {
      const scopeUserId = isPrivileged && queryAgentId ? queryAgentId : userId;

      if (!scopeUserId && !queryExtension) {
        return res.status(401).json({ message: "Authentication required" });
      }

      let userExtension = null;
      if (scopeUserId) {
        const user = await User.findByPk(scopeUserId, {
          attributes: ["extension"],
          raw: true,
        });
        userExtension =
          user?.extension != null ? String(user.extension).trim() : null;
      }

      const scopeExtension = queryExtension || userExtension;
      const conditions = [];

      if (scopeUserId) {
        conditions.push("vn.assigned_agent_id = :scopeUserId");
        replacements.scopeUserId = scopeUserId;
      }

      if (scopeExtension) {
        conditions.push(
          "(vn.assigned_agent_id IS NULL AND TRIM(CAST(vn.assigned_extension AS CHAR)) = :scopeExtension)"
        );
        replacements.scopeExtension = scopeExtension;
      }

      if (!conditions.length) {
        return res.status(400).json({ message: "Unable to scope voice notes" });
      }

      whereSql = `WHERE (${conditions.join(" OR ")})`;
    }

    const voiceNotes = await sequelize.query(
      `${VOICE_NOTE_SELECT}
${whereSql}
ORDER BY vn.created_at DESC`,
      { replacements, type: sequelize.QueryTypes.SELECT }
    );

    res.status(200).json({ voiceNotes });
  } catch (error) {
    console.error("Error fetching voice notes:", error);
    res.status(500).json({ message: "Failed to fetch voice notes" });
  }
};

const updateVoiceNote = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      recording_path,
      clid,
      assigned_agent_id,
      is_played,
      duration_seconds,
      transcription
    } = req.body;
   
    // ✅ Debug: show incoming values
    console.log("🔄 Updating Voice Note ID:", id);
    console.log("📥 Request body values:", {
      recording_path,
      clid,
      assigned_agent_id,
      is_played,
      duration_seconds,
      transcription
    });

    const [updatedRows] = await VoiceNote.update(
      {
        recording_path,
        clid,
        assigned_agent_id,
        is_played,
        duration_seconds,
        transcription
      },
      {
        where: { id }
      }
    );

    console.log("✅ Rows updated:", updatedRows);

    if (updatedRows === 0) {
      return res.status(404).json({ message: "Voice note not found or unchanged." });
    }

    const updatedVoiceNote = await VoiceNote.findByPk(id);
    res.status(200).json({ message: "Voice note updated.", voiceNote: updatedVoiceNote });
  } catch (error) {
    console.error("❌ Error updating voice note:", error);
    res.status(500).json({ error: "Failed to update voice note." });
  }
};


const markVoiceNotePlayed = async (req, res) => {
  try {
    const { id } = req.params;
    const { duration_seconds: durationFromBody } = req.body || {};
    const userId = req.user?.userId;

    let playedBy = null;
    if (userId) {
      const user = await User.findByPk(userId, {
        attributes: ["extension", "username", "full_name"],
      });
      if (user) {
        playedBy =
          user.extension ||
          user.username ||
          user.full_name ||
          String(userId);
      }
    }

    const existing = await VoiceNote.findByPk(id, {
      attributes: ["id", "duration_seconds"],
    });
    if (!existing) {
      return res.status(404).json({ error: "Voice note not found" });
    }

    const payload = {
      is_played: 1,
      played_by: playedBy,
      played_at: new Date(),
      status: "LISTENED",
    };

    const parsedDuration = parseInt(durationFromBody, 10);
    if (!Number.isNaN(parsedDuration) && parsedDuration > 0) {
      payload.duration_seconds = parsedDuration;
    }

    const [updatedRows] = await VoiceNote.update(payload, { where: { id } });

    if (updatedRows === 0) {
      return res.status(404).json({ error: "Voice note not found" });
    }

    res.json({ success: true, id: Number(id), is_played: true, played_by: playedBy });
  } catch (error) {
    console.error("Error marking voice note as played:", error);
    res.status(500).json({ error: "Failed to mark voice note as played" });
  }
};

module.exports = {
  getAllVoiceNotes,
  updateVoiceNote,
  markVoiceNotePlayed,
};
