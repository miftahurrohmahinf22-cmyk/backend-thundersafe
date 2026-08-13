const express = require('express');
const router = express.Router();
const { getLaporan, createLaporan } = require('../controllers/laporanController');
const { protect } = require('../middleware/authMiddleware');

// GET /api/laporan
router.get('/', protect, getLaporan);

// POST /api/laporan
router.post('/', protect, createLaporan);

module.exports = router;
