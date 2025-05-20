const express = require('express');
const router = express.Router();
const emegencyController = require('../controllers/emergency/emergencyController');

router.get('/', emegencyController.getAll);
router.post('/', emegencyController.create);
router.put('/:id', emegencyController.update);
router.delete('/:id', emegencyController.delete);

module.exports = router;
