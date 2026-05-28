"use strict";

const express = require("express");
const router = express.Router();

/** Placeholder until alert rules are stored in DB */
router.get("/active", (req, res) => {
  res.json([]);
});

module.exports = router;
