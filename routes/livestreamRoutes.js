<<<<<<< HEAD
 const express = require("express");
const router = express.Router();
const { spyOnCall } = require("../controllers/spyController");
//get all live calls
const {
  getAllLiveCalls,
  
} = require("../controllers/livestream/livestreamController");

router.get("/live-calls", getAllLiveCalls);
router.post("/spy", spyOnCall);

module.exports = router;
=======
 const express = require("express");
const router = express.Router();
//get all live calls
const {
  getAllLiveCalls,
  
} = require("../controllers/livestream/livestreamController");

router.get("/live-calls", getAllLiveCalls);
 

module.exports = router;
>>>>>>> d60bce46dafbb4d57873619231b42e891f54935c
