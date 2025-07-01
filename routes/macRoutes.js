const express = require("express");
const router = express.Router();
const {
  getMacUserByPhoneNumber,
} = require("../controllers/macController/macController");

router.get("/search-by-phone-number", getMacUserByPhoneNumber);

module.exports = router;
