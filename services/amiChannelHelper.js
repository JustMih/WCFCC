"use strict";

const sequelize = require("../config/mysql_connection");

/**
 * Find a live PJSIP channel name for an agent (e.g. PJSIP/1007-0000abc).
 * ChanSpy needs the full channel id, not only PJSIP/1007.
 */
async function findAgentChannelFromCel(linkedid, agentExtension) {
  if (!linkedid) return null;

  try {
    const rows = await sequelize.query(
      `
      SELECT channame, channel
      FROM cel
      WHERE linkedid = :linkedid
        AND eventtype IN ('BRIDGE_ENTER', 'ANSWER', 'CHAN_START')
        AND (channame LIKE 'PJSIP/%' OR channel LIKE 'PJSIP/%')
      ORDER BY eventtime DESC
      LIMIT 20
      `,
      {
        replacements: { linkedid },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const ext = agentExtension ? String(agentExtension) : null;

    for (const row of rows) {
      const ch = row.channame || row.channel;
      if (!ch || !ch.includes("PJSIP/")) continue;
      if (!ch.includes("-")) continue;
      if (ext && !ch.includes(`/${ext}-`)) continue;
      return ch;
    }

    for (const row of rows) {
      const ch = row.channame || row.channel;
      if (ch && ch.includes("PJSIP/") && ch.includes("-")) return ch;
    }
  } catch (err) {
    console.warn("CEL channel lookup failed:", err.message);
  }

  return null;
}

function runAmiCommand(ami, command) {
  return new Promise((resolve, reject) => {
    const lines = [];

    const onEvent = (event) => {
      if (event?.output) lines.push(event.output);
      if (event?.Output) lines.push(event.Output);
    };

    ami.on("managerevent", onEvent);

    ami.action({ Action: "Command", Command: command }, (err, res) => {
      setTimeout(() => {
        ami.removeListener("managerevent", onEvent);
        if (err) return reject(err);
        if (res?.output) lines.push(res.output);
        resolve(lines.join("\n"));
      }, 1500);
    });
  });
}

/**
 * Parse state from `pjsip list endpoints` (same view as CLI on server).
 * Registered idle = "Not in use". Not registered = "Unavailable".
 */
function parseEndpointLineFromList(output, extension) {
  const ext = String(extension).trim();
  const lines = String(output || "").split("\n");

  for (const line of lines) {
    if (!line.includes(ext)) continue;
    if (!new RegExp(`\\s${ext}\\s|\\s${ext}$|^${ext}\\s`).test(line)) {
      if (!line.includes(`/${ext}`) && !line.startsWith(`${ext} `)) continue;
    }
    if (/\bNot in use\b/i.test(line)) {
      return { registered: true, state: "Not in use", line: line.trim() };
    }
    if (/\bRinging\b/i.test(line) && !/\bUnavailable\b/i.test(line)) {
      return { registered: true, state: "Ringing", line: line.trim() };
    }
    if (/\bUnavailable\b/i.test(line)) {
      return { registered: false, state: "Unavailable", line: line.trim() };
    }
  }

  return { registered: false, state: "not_found", line: "" };
}

function parseEndpointFromShow(output) {
  const text = String(output || "");
  if (/\bNot in use\b/i.test(text)) {
    return { registered: true, state: "Not in use" };
  }
  if (/Contact:\s*\S+sip:\S+@\S+/i.test(text) || /Contact:\s+\S+@/i.test(text)) {
    return { registered: true, state: "has_contact" };
  }
  if (/\bUnavailable\b/i.test(text)) {
    return { registered: false, state: "Unavailable" };
  }
  return { registered: false, state: "unknown" };
}

function isValidSpyChannel(channel) {
  if (!channel || channel === "-") return false;
  const ch = String(channel);
  if (!ch.includes("PJSIP/") || !ch.includes("-")) return false;
  if (/PJSIP\/[a-z]$/i.test(ch)) return false;
  return true;
}

/**
 * Resolve live agent channel from AMI (more reliable than CEL during active bridge).
 */
async function findLiveSpyChannelViaAmi(ami, linkedid, agentExtension) {
  if (!ami) return null;

  return new Promise((resolve) => {
    const channels = [];
    const ext = agentExtension ? String(agentExtension) : null;
    const lid = linkedid ? String(linkedid) : null;

    const onEvent = (event) => {
      const name = event?.Event || event?.event;
      if (name === "CoreShowChannel") {
        channels.push(event);
      }
      if (name === "CoreShowChannelsComplete") {
        ami.removeListener("managerevent", onEvent);
        finish();
      }
    };

    const finish = () => {
      for (const row of channels) {
        const ch = row.Channel || row.channel;
        if (!isValidSpyChannel(ch)) continue;
        const rowLid = row.Linkedid || row.LinkedID || row.linkedid;
        if (lid && rowLid && String(rowLid) !== lid) continue;
        if (ext && !ch.includes(`/${ext}-`)) continue;
        resolve(ch);
        return;
      }

      for (const row of channels) {
        const ch = row.Channel || row.channel;
        if (!isValidSpyChannel(ch)) continue;
        if (ext && !ch.includes(`/${ext}-`)) continue;
        resolve(ch);
        return;
      }

      resolve(null);
    };

    const timeout = setTimeout(() => {
      ami.removeListener("managerevent", onEvent);
      finish();
    }, 3000);

    ami.on("managerevent", onEvent);
    ami.action({ Action: "CoreShowChannels" }, (err) => {
      if (err) {
        clearTimeout(timeout);
        ami.removeListener("managerevent", onEvent);
        resolve(null);
      }
    });
  });
}

async function isExtensionReachable(ami, extension) {
  if (!ami || !extension) {
    return { reachable: false, detail: "AMI or extension missing", asterisk_state: null };
  }

  if (
    String(process.env.SPY_SKIP_REGISTRATION_CHECK || "").toLowerCase() ===
    "true"
  ) {
    return {
      reachable: true,
      detail: "Registration check skipped (SPY_SKIP_REGISTRATION_CHECK=true)",
      asterisk_state: "skipped",
    };
  }

  try {
    const listOut = await runAmiCommand(ami, "pjsip list endpoints");
    const fromList = parseEndpointLineFromList(listOut, extension);

    if (fromList.registered) {
      return {
        reachable: true,
        detail: `Asterisk reports extension ${extension} as "${fromList.state}" (registered)`,
        asterisk_state: fromList.state,
        endpoint_line: fromList.line,
      };
    }

    const showOut = await runAmiCommand(ami, `pjsip show endpoint ${extension}`);
    const fromShow = parseEndpointFromShow(showOut);

    if (fromShow.registered) {
      return {
        reachable: true,
        detail: `Asterisk reports extension ${extension} is registered`,
        asterisk_state: fromShow.state,
      };
    }

    const state = fromList.state || fromShow.state || "Unavailable";
    const sipDomain =
      process.env.SIP_DOMAIN ||
      process.env.SIP_DOMAIN_CONFIG ||
      "democc.wcf.go.tz";

    return {
      reachable: false,
      asterisk_state: state,
      endpoint_line: fromList.line,
      detail:
        `Extension ${extension} is in WCF but Asterisk shows "${state}" (not registered). ` +
        `Open the Agent Dashboard phone (or Zoiper), register as ext ${extension} ` +
        `to ${sipDomain}, then run: asterisk -rx "pjsip list endpoints" — ` +
        `it must show "Not in use", not "Unavailable".`,
    };
  } catch (err) {
    console.warn("PJSIP registration check failed:", err.message);
    return {
      reachable: true,
      detail: "Could not verify registration (will attempt originate)",
      asterisk_state: "check_failed",
    };
  }
}

module.exports = {
  findAgentChannelFromCel,
  findLiveSpyChannelViaAmi,
  isValidSpyChannel,
  isExtensionReachable,
  runAmiCommand,
  parseEndpointLineFromList,
};
