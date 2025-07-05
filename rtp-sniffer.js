<<<<<<< HEAD
const { spawn } = require("child_process");
const readline = require("readline");
const axios = require("axios");

const tcpdump = spawn("tcpdump", [
  "-i", "any",
  "udp", "portrange", "10000-20000",
  "-nn", "-v"
]);

const rl = readline.createInterface({
  input: tcpdump.stdout
});

rl.on("line", async (line) => {
  // Simplified RTP packet parsing
  if (line.includes("UDP")) {
    const match = line.match(/IP (\d+\.\d+\.\d+\.\d+)\.(\d+) > (\d+\.\d+\.\d+\.\d+)\.(\d+):/);
    if (match) {
      const [_, source_ip, source_port, dest_ip, dest_port] = match;

      const packet = {
        ts: Date.now(),
        seq: 0,
        len: 0,
        source_ip,
        source_port
      };

      // Forward to your backend via /emit-rtp
      try {
        await axios.post("http://localhost:5070/api/live-streaming/emit-rtp", packet);
      } catch (err) {
        console.error("Failed to emit RTP:", err.message);
      }
    }
  }
});
=======
const { spawn } = require("child_process");
const readline = require("readline");
const axios = require("axios");

const tcpdump = spawn("tcpdump", [
  "-i", "any",
  "udp", "portrange", "10000-20000",
  "-nn", "-v"
]);

const rl = readline.createInterface({
  input: tcpdump.stdout
});

rl.on("line", async (line) => {
  // Simplified RTP packet parsing
  if (line.includes("UDP")) {
    const match = line.match(/IP (\d+\.\d+\.\d+\.\d+)\.(\d+) > (\d+\.\d+\.\d+\.\d+)\.(\d+):/);
    if (match) {
      const [_, source_ip, source_port, dest_ip, dest_port] = match;

      const packet = {
        ts: Date.now(),
        seq: 0,
        len: 0,
        source_ip,
        source_port
      };

      // Forward to your backend via /emit-rtp
      try {
        await axios.post("http://localhost:5070/api/live-streaming/emit-rtp", packet);
      } catch (err) {
        console.error("Failed to emit RTP:", err.message);
      }
    }
  }
});
>>>>>>> 89c0728fdae97d887e37872c58d3028b845ced71

<<<<<<< HEAD
const { spawn } = require("child_process");
const readline = require("readline");
const axios = require("axios");

const tcpdump = spawn("tcpdump", [
  "-i", "any",
  "udp", "portrange", "10000-20000",
  "-nn", "-v"
]);

const rl = readline.createInterface({
  input: tcpdump.stdout
});

rl.on("line", async (line) => {
  // Simplified RTP packet parsing
  if (line.includes("UDP")) {
    const match = line.match(/IP (\d+\.\d+\.\d+\.\d+)\.(\d+) > (\d+\.\d+\.\d+\.\d+)\.(\d+):/);
    if (match) {
      const [_, source_ip, source_port, dest_ip, dest_port] = match;

      const packet = {
        ts: Date.now(),
        seq: 0,
        len: 0,
        source_ip,
        source_port
      };

      // Forward to your backend via /emit-rtp
      try {
        await axios.post("http://localhost:5070/api/live-streaming/emit-rtp", packet);
      } catch (err) {
        console.error("Failed to emit RTP:", err.message);
      }
    }
  }
});
=======
const { spawn } = require("child_process");
const readline = require("readline");
const axios = require("axios");

const tcpdump = spawn("tcpdump", [
  "-i", "any",
  "udp", "portrange", "10000-20000",
  "-nn", "-v"
]);

const rl = readline.createInterface({
  input: tcpdump.stdout
});

rl.on("line", async (line) => {
  // Simplified RTP packet parsing
  if (line.includes("UDP")) {
    const match = line.match(/IP (\d+\.\d+\.\d+\.\d+)\.(\d+) > (\d+\.\d+\.\d+\.\d+)\.(\d+):/);
    if (match) {
      const [_, source_ip, source_port, dest_ip, dest_port] = match;

      const packet = {
        ts: Date.now(),
        seq: 0,
        len: 0,
        source_ip,
        source_port
      };

      // Forward to your backend via /emit-rtp
      try {
        await axios.post("http://localhost:5070/api/live-streaming/emit-rtp", packet);
      } catch (err) {
        console.error("Failed to emit RTP:", err.message);
      }
    }
  }
});
>>>>>>> 89c0728fdae97d887e37872c58d3028b845ced71
