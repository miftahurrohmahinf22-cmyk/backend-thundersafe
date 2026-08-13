const bcrypt = require('bcrypt');
const { pool } = require('../config/db');

// @desc    Ambil data profil pengguna yang login
// @route   GET /api/users/profile
// @access  Private
const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRes = await pool.query(
      'SELECT id, nama, email, "photo profile" as photo_profile, role, create_at FROM "User" WHERE id = $1',
      [userId]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Pengguna tidak ditemukan.'
      });
    }

    res.status(200).json({
      success: true,
      user: userRes.rows[0]
    });
  } catch (error) {
    console.error('Error di userController (getProfile):', error.message);
    res.status(500).json({
      success: false,
      message: 'Gagal mengambil data profil.'
    });
  }
};

// @desc    Perbarui profil pengguna (Nama, Photo Profile)
// @route   PUT /api/users/profile
// @access  Private
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { nama, photo_profile } = req.body;

    if (!nama) {
      return res.status(400).json({
        success: false,
        message: 'Nama tidak boleh kosong.'
      });
    }

    // Lakukan update ke database
    await pool.query(
      `UPDATE "User"
       SET nama = $1, "photo profile" = COALESCE($2, "photo profile"), update_at = NOW()
       WHERE id = $3`,
      [nama, photo_profile, userId]
    );

    // Ambil user ter-update
    const updatedUserRes = await pool.query(
      'SELECT id, nama, email, "photo profile" as photo_profile, role FROM "User" WHERE id = $1',
      [userId]
    );

    res.status(200).json({
      success: true,
      message: 'Profil berhasil diperbarui.',
      user: updatedUserRes.rows[0]
    });
  } catch (error) {
    console.error('Error di userController (updateProfile):', error.message);
    res.status(500).json({
      success: false,
      message: 'Gagal memperbarui profil.'
    });
  }
};

// @desc    Ubah kata sandi pengguna
// @route   PUT /api/users/change-password
// @access  Private
const changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Silakan isi kata sandi lama dan kata sandi baru.'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Kata sandi baru minimal harus 6 karakter.'
      });
    }

    // Ambil password lama dari database
    const userRes = await pool.query('SELECT password FROM "User" WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Pengguna tidak ditemukan.'
      });
    }

    const hashedOldPassword = userRes.rows[0].password;

    // Cocokkan password lama
    const isMatch = await bcrypt.compare(oldPassword, hashedOldPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Kata sandi lama yang Anda masukkan salah.'
      });
    }

    // Hash password baru
    const salt = await bcrypt.genSalt(10);
    const hashedNewPassword = await bcrypt.hash(newPassword, salt);

    // Simpan ke database
    await pool.query(
      `UPDATE "User"
       SET password = $1, update_at = NOW()
       WHERE id = $2`,
      [hashedNewPassword, userId]
    );

    res.status(200).json({
      success: true,
      message: 'Kata sandi berhasil diperbarui.'
    });
  } catch (error) {
    console.error('Error di userController (changePassword):', error.message);
    res.status(500).json({
      success: false,
      message: 'Gagal merubah kata sandi.'
    });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  changePassword
};