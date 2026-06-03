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

function appendAgentScope(conditions, replacements, user) {
  if (!user) return false;
  conditions.push(
    "(vn.assigned_agent_id = :agentUserId OR vn.assigned_extension = :agentExtension)"
  );
  replacements.agentUserId = String(user.id);
  replacements.agentExtension = user.extension
    ? String(user.extension)
    : "__no_extension__";
  return true;
}

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
    const { unplayedOnly } = req.query;

    const conditions = [];
    const replacements = {};

    if (unplayedOnly === "true" || unplayedOnly === "1") {
      conditions.push("(vn.is_played = 0 OR vn.is_played IS NULL)");
    }

    const isPrivileged = PRIVILEGED_VOICE_NOTE_ROLES.has(role);

    if (isPrivileged && !queryAgentId && !queryExtension) {
      // Supervisors/admins: all voice notes when no filter requested
    } else if (queryAgentId) {
      const user = await User.findByPk(queryAgentId, {
        attributes: ["extension", "id"],
      });
      if (user) {
        appendAgentScope(conditions, replacements, user);
      } else {
        conditions.push("vn.assigned_agent_id = :agentUserId");
        replacements.agentUserId = queryAgentId;
      }
    } else if (queryExtension) {
      conditions.push("vn.assigned_extension = :agentExtension");
      replacements.agentExtension = queryExtension;
    } else if (userId) {
      const user = await User.findByPk(userId, {
        attributes: ["extension", "id"],
      });
      if (!appendAgentScope(conditions, replacements, user)) {
        return res.status(401).json({ message: "Authentication required" });
      }
    } else {
      return res.status(401).json({ message: "Authentication required" });
    }

    const whereSql =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

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
      transcription,
    } = req.body;

    const [updatedRows] = await VoiceNote.update(
      {
        recording_path,
        clid,
        assigned_agent_id,
        is_played,
        duration_seconds,
        transcription,
      },
      {
        where: { id },
      }
    );

    if (updatedRows === 0) {
      return res
        .status(404)
        .json({ message: "Voice note not found or unchanged." });
    }

    const updatedVoiceNote = await VoiceNote.findByPk(id);
    res
      .status(200)
      .json({ message: "Voice note updated.", voiceNote: updatedVoiceNote });
  } catch (error) {
    console.error("Error updating voice note:", error);
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

    res.json({
      success: true,
      id: Number(id),
      is_played: true,
      played_by: playedBy,
    });
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
