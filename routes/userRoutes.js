const express = require('express');
const router = express.Router();
const { getProfile, updateProfile, changePassword } = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

// GET /api/users/profile - Dapatkan profil
router.get('/profile', protect, getProfile);

// PUT /api/users/profile - Perbarui profil
router.put('/profile', protect, updateProfile);

// PUT /api/users/change-password - Ganti kata sandi
router.put('/change-password', protect, changePassword);

module.exports = router;
