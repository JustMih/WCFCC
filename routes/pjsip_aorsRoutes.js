const express = require("express");
const router = express.Router();
const {
  createAor,
  getAllAors,
  getAorById,
  updateAor,
  deleteAor,
} = require("../controllers/pjsip_aors/pjsip_aorsController");

router.post("/", createAor);
router.get("/", getAllAors);
router.get("/:id", getAorById);
router.put("/:id", updateAor);
router.delete("/:id", deleteAor);

module.exports = router;
