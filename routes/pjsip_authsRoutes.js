const express = require("express");
const router = express.Router();
const {
  createAuth,
  getAllAuths,
  getAuthById,
  updateAuth,
  deleteAuth,
} = require("../controllers/pjsip_auths/pjsip_authsController");

router.post("/", createAuth);
router.get("/", getAllAuths);
router.get("/:id", getAuthById);
router.put("/:id", updateAuth);
router.delete("/:id", deleteAuth);

module.exports = router;
