"use strict";

const { getAmi, isAmiConfigured } = require("./amiService");
const { findLiveSpyChannelViaAmi, isValidSpyChannel } = require("./amiChannelHelper");

/**
 * Hang up a single AMI channel (best-effort).
 */
function amiHangupChannel(ami, channel) {
  return new Promise((resolve) => {
    if (!ami || !channel) {
      resolve({ ok: false, reason: "missing" });
      return;
    }
    ami.action(
      {
        Action: "Hangup",
        Channel: channel,
        Cause: "16", // Normal clearing
      },
      (err, res) => {
        if (err) {
          console.warn(`[HangupAgent] Hangup failed for ${channel}:`, err.message || err);
          resolve({ ok: false, channel, error: err.message || String(err) });
          return;
        }
        console.log(`[HangupAgent] Hung up ${channel}`);
        resolve({ ok: true, channel, response: res });
      }
    );
  });
}

/**
 * Find all live PJSIP channels for an agent extension via CoreShowChannels.
 */
function findAllAgentChannelsViaAmi(ami, extension) {
  if (!ami || !extension) return Promise.resolve([]);

  const ext = String(extension).trim();

  return new Promise((resolve) => {
    const channels = [];

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
      const matches = [];
      for (const row of channels) {
        const ch = row.Channel || row.channel;
        if (!isValidSpyChannel(ch)) continue;
        if (!ch.includes(`/${ext}-`)) continue;
        matches.push(ch);
      }
      resolve(matches);
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
        resolve([]);
      }
    });
  });
}

/**
 * Hang up all live channels for an agent extension so the customer bridge
 * and queue wallboard clear when the browser tears down without a clean BYE.
 * Fire-and-forget safe: never throws to HTTP callers beyond returned status.
 */
async function hangupAgentCallByExtension(extension) {
  const ext = String(extension || "").trim();
  if (!ext) {
    return { ok: false, message: "extension required" };
  }

  if (!isAmiConfigured()) {
    return { ok: false, message: "AMI not configured" };
  }

  const ami = getAmi();
  if (!ami) {
    return { ok: false, message: "AMI not connected" };
  }

  let channels = await findAllAgentChannelsViaAmi(ami, ext);

  if (channels.length === 0) {
    const one = await findLiveSpyChannelViaAmi(ami, null, ext);
    if (one) channels = [one];
  }

  if (channels.length === 0) {
    console.log(`[HangupAgent] No live PJSIP channel for ext ${ext}`);
    return { ok: true, hungUp: [], message: "no live channel" };
  }

  const results = [];
  for (const ch of channels) {
    results.push(await amiHangupChannel(ami, ch));
  }

  return {
    ok: true,
    hungUp: results.filter((r) => r.ok).map((r) => r.channel),
    failed: results.filter((r) => !r.ok),
  };
}

module.exports = {
  hangupAgentCallByExtension,
  findAllAgentChannelsViaAmi,
};
