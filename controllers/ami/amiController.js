const AsteriskManager = require("asterisk-manager");

// AMI connection setup
const ami = new AsteriskManager(
  5038, // AMI port
  "10.52.0.19", // Asterisk server IP
  "admin", // AMI username
  "@Ttcl123", // AMI password
  true // Enable events
);

let isConnected = false; // Track Asterisk connection status

function connectAsterisk() {
  return new Promise((resolve, reject) => {
    // On connection
    ami.on("connect", () => {
      isConnected = true; // Set to true when connected
      console.log("Connected to Asterisk AMI");

      // Optionally, you can initiate a test call or leave it empty if you only need connection check

      
      resolve(); // Resolve the promise when connected
    });

    // Handle errors
    ami.on("error", (err) => {
      console.error("AMI Error:", err);
      isConnected = false; // Set to false on error
      reject(err); // Reject promise on error
    });

    // Handle AMI events like call status or other events
    // ami.on("managerevent", (event) => {
    //   console.log("AMI Event:", event);
    // });

    // Handle AMI connection closure
    ami.on("close", () => {
      isConnected = false; // Set to false if connection is closed
      console.log("Asterisk AMI connection closed.");
    });
  });
}

function makeCall(channel, number) {
  return new Promise((resolve, reject) => {
    if (!isConnected) {
      reject(new Error("Asterisk AMI is not connected."));
    }

    // Originate the call
    ami.action(
      {
        Action: "Originate",
        Channel: `PJSIP/${channel}`, // Use PJSIP or SIP depending on your setup
        Exten: number,
        Context: "internal",
        Priority: 1,
        CallerID: `NodeJS <${channel}>`,
        Timeout: 30000,
        Async: true, // Asynchronous call
      },
      (err, res) => {
        if (err) {
          reject(new Error(`Error originating call: ${err}`));
        } else {
          resolve("Call originated successfully.");
        }
      }
    );
  });
}


module.exports = { connectAsterisk, makeCall };
