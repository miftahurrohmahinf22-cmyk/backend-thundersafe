const express = require('express');
const router = express.Router();
const { getNotifications, markAsRead, streamNotifications } = require('../controllers/notifikasiController');
const { protect } = require('../middleware/authMiddleware');

// GET /api/notifications/stream (SSE Stream)
router.get('/stream', protect, streamNotifications);

// GET /api/notifications
router.get('/', protect, getNotifications);

// PUT /api/notifications/read/:id
router.put('/read/:id', protect, markAsRead);

module.exports = router;
