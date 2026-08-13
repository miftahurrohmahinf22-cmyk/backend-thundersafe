const express = require('express');
const router = express.Router();
const { getHistory, deleteHistory } = require('../controllers/hasilPrediksiController');
const { protect } = require('../middleware/authMiddleware');

// GET /api/history
router.get('/', protect, getHistory);

// DELETE /api/history/:id
router.delete('/:id', protect, deleteHistory);

module.exports = router;
