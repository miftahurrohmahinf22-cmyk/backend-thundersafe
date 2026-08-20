const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../config/db');
const { JWT_SECRET } = require('../middleware/authMiddleware');

// @desc    Register user baru
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res) => {
  try {
    const { nama, email, password } = req.body;

    // Validasi input
    if (!nama || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Silakan lengkapi semua kolom input (nama, email, password).'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Kata sandi minimal harus 6 karakter.'
      });
    }

    const cleanEmail = email ? email.trim().toLowerCase() : '';

    // Cek apakah email sudah terdaftar
    const userExistRes = await pool.query('SELECT id FROM "User" WHERE LOWER(email) = LOWER($1)', [cleanEmail]);
    if (userExistRes.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Alamat email ini sudah terdaftar. Silakan masuk.'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insert user baru ke database
    const userId = crypto.randomUUID();
    const defaultPhoto = '';
    const role = 'user';

    await pool.query(
      `INSERT INTO "User" (id, nama, email, password, "photo profile", role, create_at, update_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [userId, nama.trim(), cleanEmail, hashedPassword, defaultPhoto, role]
    );

    res.status(201).json({
      success: true,
      message: 'Pendaftaran berhasil. Silakan masuk ke akun Anda.'
    });

  } catch (error) {
    console.error('Error di authController (register):', error.message);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan sistem saat mendaftar.'
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validasi input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Silakan masukkan email dan kata sandi.'
      });
    }

    const cleanEmail = email ? email.trim().toLowerCase() : '';

    // Cari user berdasarkan email (case-insensitive & trimmed)
    const userRes = await pool.query('SELECT * FROM "User" WHERE LOWER(email) = LOWER($1)', [cleanEmail]);
    if (userRes.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Email atau kata sandi salah.'
      });
    }

    const user = userRes.rows[0];

    // Cocokkan password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Email atau kata sandi salah.'
      });
    }

    // Buat token JWT
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        nama: user.nama,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(200).json({
      success: true,
      message: 'Login berhasil.',
      token,
      user: {
        id: user.id,
        nama: user.nama,
        email: user.email,
        role: user.role,
        photo_profile: user['photo profile']
      }
    });

  } catch (error) {
    console.error('Error di authController (login):', error.message);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan sistem saat login.'
    });
  }
};

module.exports = {
  register,
  login
};
