const express = require('express');
const router = express.Router();
const { getSemuaEdukasi, getEdukasiById } = require('../controllers/edukasiController');

// Endpoint: GET /api/edukasi
router.get('/', getSemuaEdukasi);

// Endpoint: GET /api/edukasi/:id
router.get('/:id', getEdukasiById);

module.exports = router;