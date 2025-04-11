const express = require("express");
const router = express.Router();
const {
  addIVRAction,
  getAllIVRActions,
  getIVRActionById,
  updateIVRAction,
  deleteIVRAction,
} = require("../controllers/ivrAction/ivrActionController");

router.post("/", addIVRAction);
router.get("/", getAllIVRActions);
router.get("/:id", getIVRActionById);
router.put("/:id", updateIVRAction);
router.delete("/:id", deleteIVRAction);

module.exports = router;