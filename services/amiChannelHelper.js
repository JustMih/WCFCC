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

function parsePjsipEndpointAvailable(commandOutput) {
  const text = String(commandOutput || "");
  if (/Unavailable/i.test(text) && !/Avail/i.test(text)) return false;
  if (/Contact:\s+\S+@/i.test(text)) return true;
  if (/Endpoint:\s+.*\s+Avail/i.test(text)) return true;
  if (/Not in use/i.test(text)) return true;
  return false;
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
      }, 600);
    });
  });
}

async function isExtensionReachable(ami, extension) {
  if (!ami || !extension) return { reachable: false, detail: "AMI or extension missing" };

  try {
    const output = await runAmiCommand(
      ami,
      `pjsip show endpoint ${extension}`
    );
    const reachable = parsePjsipEndpointAvailable(output);
    return {
      reachable,
      detail: reachable
        ? "PJSIP endpoint has active contact"
        : "PJSIP endpoint not registered — open your softphone and register first",
      output: output.slice(0, 500),
    };
  } catch (err) {
    return { reachable: true, detail: "Could not verify registration (proceeding)" };
  }
}

module.exports = {
  findAgentChannelFromCel,
  isExtensionReachable,
  runAmiCommand,
};
