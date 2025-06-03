const express = require('express');
const router = express.Router();
const holidayController = require('../controllers/holidays/holidayController');

router.get('/', holidayController.getAllHolidays);
router.post('/', holidayController.addHoliday);
router.delete('/:id', holidayController.deleteHoliday);
router.put('/:id', holidayController.updateHoliday);

module.exports = router;
