<<<<<<< HEAD
const io = require("socket.io-client");

async function testSocketConnection() {
  try {
    console.log("Testing socket connection to http://192.168.21.69:5070...");

    const socket = io("http://192.168.21.69:5070");

    socket.on("connect", () => {
      console.log("✅ Socket connected successfully!");
      console.log("Socket ID:", socket.id);

      // Test sending a message
      const testMessage = {
        senderId: "test-sender",
        receiverId: "test-receiver",
        message: "Test message",
        timestamp: new Date().toISOString(),
      };

      console.log("Sending test message:", testMessage);
      socket.emit("private_message", testMessage);

      // Disconnect after test
      setTimeout(() => {
        socket.disconnect();
        console.log("Test completed, socket disconnected");
      }, 2000);
    });

    socket.on("connect_error", (error) => {
      console.error("❌ Socket connection failed:", error.message);
      process.exit(1);
    });

    socket.on("private_message", (data) => {
      console.log("Received message:", data);
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      console.log("❌ Connection timeout");
      socket.disconnect();
      process.exit(1);
    }, 5000);
  } catch (error) {
    console.error("❌ Error testing socket connection:", error);
  }
}

testSocketConnection();
=======
const io = require("socket.io-client");

async function testSocketConnection() {
  try {
    console.log("Testing socket connection to http://192.168.21.70:5070...");

    const socket = io("http://192.168.21.70:5070");

    socket.on("connect", () => {
      console.log("✅ Socket connected successfully!");
      console.log("Socket ID:", socket.id);

      // Test sending a message
      const testMessage = {
        senderId: "test-sender",
        receiverId: "test-receiver",
        message: "Test message",
        timestamp: new Date().toISOString(),
      };

      console.log("Sending test message:", testMessage);
      socket.emit("private_message", testMessage);

      // Disconnect after test
      setTimeout(() => {
        socket.disconnect();
        console.log("Test completed, socket disconnected");
      }, 2000);
    });

    socket.on("connect_error", (error) => {
      console.error("❌ Socket connection failed:", error.message);
      process.exit(1);
    });

    socket.on("private_message", (data) => {
      console.log("Received message:", data);
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      console.log("❌ Connection timeout");
      socket.disconnect();
      process.exit(1);
    }, 5000);
  } catch (error) {
    console.error("❌ Error testing socket connection:", error);
  }
}

testSocketConnection();
>>>>>>> d60bce46dafbb4d57873619231b42e891f54935c
