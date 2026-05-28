"use strict";

const AsteriskManager = require("asterisk-manager");

let ami = null;

function getAmi() {
  if (ami) return ami;

  const pass = process.env.AMI_PASS;
  if (!pass) {
    return null;
  }

  const port = Number(process.env.AMI_PORT || 5038);
  const host =
    process.env.AMI_HOST ||
    process.env.ASTERISK_HOST ||
    process.env.DB_HOST ||
    "127.0.0.1";
  const user = process.env.AMI_USER || "admin";

  ami = new AsteriskManager(port, host, user, pass, true);
  ami.keepConnected();

  ami.on("connect", () => console.log("✅ Supervisor AMI connected"));
  ami.on("error", (err) => console.error("❌ Supervisor AMI error:", err.message));

  return ami;
}

function isAmiConfigured() {
  return Boolean(process.env.AMI_PASS && String(process.env.AMI_PASS).trim());
}

function getAmiStatus() {
  return {
    configured: isAmiConfigured(),
    host:
      process.env.AMI_HOST ||
      process.env.ASTERISK_HOST ||
      process.env.DB_HOST ||
      "127.0.0.1",
    port: Number(process.env.AMI_PORT || 5038),
    user: process.env.AMI_USER || "admin",
  };
}

module.exports = { getAmi, isAmiConfigured, getAmiStatus };
