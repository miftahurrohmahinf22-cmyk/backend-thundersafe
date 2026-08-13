const express = require('express');
const router = express.Router();
const { getCuacaTerbaru } = require('../controllers/dataCuacacontroller');

// Endpoint: GET /api/cuaca/terbaru
router.get('/terbaru', getCuacaTerbaru);

module.exports = router;