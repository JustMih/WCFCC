const axios = require("axios");

exports.getLiveChannelByExtension = async (extension) => {
  try {
    console.log("🧪 Resolving live channel for ext:", extension);

    const PORT = process.env.PORT || 5070;

    // ✅ IMPORTANT: include /api
    const url = `http://127.0.0.1:${PORT}/api/livestream/live-calls`;

    const res = await axios.get(url);

    const calls = Array.isArray(res.data) ? res.data : [];

    console.log("📞 Calling Calls:", calls);

    // Normalize extension comparison
    const normalize = v =>
      String(v || "").replace("PJSIP/", "").trim();

    const call = calls.find(c =>
      normalize(c.agent_extension) === normalize(extension) &&
      String(c.status).toLowerCase() === "active"
    );

    if (!call) {
      console.log("🧪 No active call found for ext:", extension);
      return null;
    }

    const channel =
      call.agent_channel ||
      call.spyCallId ||
      (call.agent_extension ? `PJSIP/${call.agent_extension}` : null) ||
      call.channel;

    console.log("🧪 Found channel:", channel);

    return channel || null;
  } catch (err) {
    console.error(
      "❌ getLiveChannelByExtension error:",
      err.response?.status,
      err.response?.data || err.message
    );
    return null;
  }
};
