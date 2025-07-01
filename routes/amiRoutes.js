const express = require("express");
const { makeCall } = require("../controllers/ami/amiController");
const { authMiddleware } = require("../middleware/authMiddleware");
const router = express.Router();

// Route to make a call
router.post("/call", authMiddleware, async (req, res) => {
  const { channel, number } = req.body;

  // Validate the incoming request data
  if (!channel || !number) {
    return res.status(400).json({ error: "Missing channel or number" });
  }

  try {
    // Call the function to initiate the call
    const message = await makeCall(channel, number);

    // Respond with success message
    res.status(200).json({ message: message });
  } catch (error) {
    // Handle any error in the process of making the call
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
