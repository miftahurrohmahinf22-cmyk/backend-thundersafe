const express = require('express');
const router = express.Router();
const { predictRisk } = require('../controllers/prediksiController');
const { protect, authorizeRole } = require('../middleware/authMiddleware');

// POST /api/prediction - Registered User & Admin
router.post('/', protect, predictRisk);

module.exports = router;