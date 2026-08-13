const express = require('express');
const router = express.Router();
const { predictRisk } = require('../controllers/prediksiController');
const { protect, authorizeRole } = require('../middleware/authMiddleware');

// POST /api/prediction - Admin only
router.post('/', protect, authorizeRole('admin'), predictRisk);

module.exports = router;