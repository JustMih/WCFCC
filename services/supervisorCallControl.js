"use strict";

const User = require("../models/User");
const { getAmi, isAmiConfigured } = require("./amiService");
const {
  findAgentChannelFromCel,
  findLiveSpyChannelViaAmi,
  isValidSpyChannel,
  isExtensionReachable,
} = require("./amiChannelHelper");

const MODE_MAP = {
  listen: "q",
  whisper: "qw",
  barge: "qB",
};

const SUPERVISOR_ROLES = [
  "supervisor",
  "admin",
  "super-admin",
  "director-general",
];

function normalizeMode(mode) {
  const key = String(mode || "listen").toLowerCase();
  return MODE_MAP[key] ? key : null;
}

function resolveSpyChannel(call) {
  if (!call) return null;

  const agentChannel = call.agent_channel;
  if (agentChannel && agentChannel !== "-") {
    return agentChannel;
  }

  const spyId = call.spyCallId;
  if (spyId && spyId !== "-") {
    return spyId;
  }

  if (call.agent_extension) {
    return `PJSIP/${call.agent_extension}`;
  }

  return null;
}

async function getSupervisorExtension(userId, overrideExtension) {
  if (userId) {
    const user = await User.findByPk(userId, {
      attributes: ["extension", "role", "full_name"],
    });
    if (user?.extension) {
      return String(user.extension).trim();
    }
  }

  if (overrideExtension) {
    return String(overrideExtension).trim();
  }

  const fallback = process.env.SUPERVISOR_SPY_EXTENSION;
  return fallback ? String(fallback).trim() : null;
}

async function resolveSpyChannelDeep(call) {
  const ami = getAmi();

  const fromAmi = await findLiveSpyChannelViaAmi(
    ami,
    call.linkedid,
    call.agent_extension
  );
  if (fromAmi) return fromAmi;

  const fromCall = resolveSpyChannel(call);
  if (isValidSpyChannel(fromCall)) {
    return fromCall;
  }

  const fromCel = await findAgentChannelFromCel(
    call.linkedid,
    call.agent_extension
  );
  if (fromCel) return fromCel;

  if (call.agent_extension) {
    return `PJSIP/${call.agent_extension}`;
  }

  return null;
}

function findActiveCallByLinkedId(calls, linkedid) {
  if (!Array.isArray(calls) || !linkedid) return null;
  return calls.find(
    (c) =>
      c.linkedid === linkedid && String(c.status).toLowerCase() === "active"
  );
}

function originateChanSpy(supervisorExtension, spyChannel, mode) {
  const ami = getAmi();
  if (!ami) {
    return Promise.reject(
      new Error("AMI is not configured (set AMI_PASS on the server)")
    );
  }

  const option = MODE_MAP[mode];

  return new Promise((resolve, reject) => {
    ami.action(
      {
        Action: "Originate",
        Channel: `PJSIP/${supervisorExtension}`,
        Application: "ChanSpy",
        Data: `${spyChannel},${option}`,
        Async: "true",
        Timeout: "30000",
        CallerID: `Supervisor <${supervisorExtension}>`,
      },
      (err, res) => {
        if (err) {
          return reject(err);
        }
        if (res && String(res.response).toLowerCase() === "error") {
          const msg = res.message || "AMI Originate failed";
          return reject(
            new Error(
              `${msg} (supervisor PJSIP/${supervisorExtension} → spy ${spyChannel})`
            )
          );
        }
        resolve(res);
      }
    );
  });
}

async function supervisorSpyOnLinkedCall({
  userId,
  linkedid,
  mode,
  supervisorExtension,
  getLiveCalls,
}) {
  const normalizedMode = normalizeMode(mode);
  if (!normalizedMode) {
    throw Object.assign(new Error("Invalid mode. Use listen, whisper, or barge"), {
      statusCode: 400,
    });
  }

  if (!linkedid) {
    throw Object.assign(new Error("linkedid is required"), { statusCode: 400 });
  }

  if (!isAmiConfigured()) {
    throw Object.assign(new Error("AMI is not configured on the server"), {
      statusCode: 503,
    });
  }

  const supExt = await getSupervisorExtension(userId, supervisorExtension);
  if (!supExt) {
    throw Object.assign(
      new Error(
        "Supervisor extension not found. Add your extension in User profile (WCF admin), then log in again."
      ),
      { statusCode: 400 }
    );
  }

  const ami = getAmi();
  const reg = await isExtensionReachable(ami, supExt);
  if (!reg.reachable) {
    throw Object.assign(
      new Error(reg.detail),
      {
        statusCode: 409,
        asterisk_state: reg.asterisk_state,
        endpoint_line: reg.endpoint_line,
      }
    );
  }

  const liveCalls =
    typeof getLiveCalls === "function" ? await getLiveCalls() : [];
  const call = findActiveCallByLinkedId(liveCalls, linkedid);

  if (!call) {
    throw Object.assign(new Error("No active call found for this linkedid"), {
      statusCode: 409,
    });
  }

  if (!call.agent_extension) {
    throw Object.assign(
      new Error(
        "Call is not connected to an agent yet. Wait until status is active with an agent, then try Listen."
      ),
      { statusCode: 409 }
    );
  }

  const spyChannel = await resolveSpyChannelDeep(call);
  if (!spyChannel) {
    throw Object.assign(new Error("Could not resolve agent channel to spy on"), {
      statusCode: 409,
    });
  }

  const amiResult = await originateChanSpy(supExt, spyChannel, normalizedMode);

  return {
    success: true,
    mode: normalizedMode,
    supervisor_extension: supExt,
    spy_channel: spyChannel,
    agent_extension: call.agent_extension,
    agent_name: call.agent_name,
    linkedid,
    ami_message: amiResult?.message || "Originate accepted",
    instructions: [
      `Extension ${supExt} on this dashboard should ring now — click Answer on the yellow bar above.`,
      "You hear the agent call in the browser (no Agent Dashboard needed).",
      "If nothing rings: wait until SIP status is Idle/Ready, then try Listen again.",
    ],
  };
}

async function supervisorSpyOnAgent({
  userId,
  agentExtension,
  mode,
  supervisorExtension,
  getLiveCalls,
}) {
  const normalizedMode = normalizeMode(mode);
  if (!normalizedMode) {
    throw Object.assign(new Error("Invalid action. Use listen, whisper, or barge"), {
      statusCode: 400,
    });
  }

  if (!agentExtension) {
    throw Object.assign(new Error("agentExtension is required"), {
      statusCode: 400,
    });
  }

  const liveCalls =
    typeof getLiveCalls === "function" ? await getLiveCalls() : [];
  const ext = String(agentExtension).trim();

  const call = liveCalls.find(
    (c) =>
      String(c.agent_extension) === ext &&
      String(c.status).toLowerCase() === "active"
  );

  if (!call) {
    throw Object.assign(new Error("Agent is not on an active call"), {
      statusCode: 409,
    });
  }

  return supervisorSpyOnLinkedCall({
    userId,
    linkedid: call.linkedid,
    mode: normalizedMode,
    supervisorExtension,
    getLiveCalls,
  });
}

module.exports = {
  MODE_MAP,
  SUPERVISOR_ROLES,
  normalizeMode,
  resolveSpyChannel,
  supervisorSpyOnLinkedCall,
  supervisorSpyOnAgent,
};
