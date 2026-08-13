const express = require('express');
const router = express.Router();
const { getLokasi } = require('../controllers/lokasiController');

// GET /api/lokasi
router.get('/', getLokasi);

module.exports = router;
