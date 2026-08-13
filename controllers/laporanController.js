const crypto = require('crypto');
const { pool } = require('../config/db');

// @desc    Ambil riwayat download laporan PDF oleh user
// @route   GET /api/laporan
// @access  Private
const getLaporan = async (req, res) => {
  try {
    const userId = req.user.id;
    const reportsRes = await pool.query(
      `SELECT lap.id, lap.nama_file, lap.file_url, lap.created_at,
              hp.tingkat_risiko, hp.probabilitas, l.nama_pos
       FROM laporan lap
       JOIN hasil_prediksi hp ON lap.hasil_prediksi_id = hp.id
       JOIN lokasi l ON hp.lokasi_id = l.id
       WHERE lap.user_id = $1
       ORDER BY lap.created_at DESC`,
      [userId]
    );

    res.status(200).json({
      success: true,
      data: reportsRes.rows
    });
  } catch (error) {
    console.error('Error di laporanController (getLaporan):', error.message);
    res.status(500).json({
      success: false,
      message: 'Gagal memuat daftar laporan.'
    });
  }
};

// @desc    Simpan log download laporan PDF baru
// @route   POST /api/laporan
// @access  Private
const createLaporan = async (req, res) => {
  try {
    const userId = req.user.id;
    const { hasil_prediksi_id, nama_file } = req.body;

    if (!hasil_prediksi_id || !nama_file) {
      return res.status(400).json({
        success: false,
        message: 'Parameter hasil_prediksi_id dan nama_file harus disertakan.'
      });
    }

    // Pastikan hasil prediksi valid
    const predCheck = await pool.query(
      'SELECT id FROM hasil_prediksi WHERE id = $1',
      [hasil_prediksi_id]
    );

    if (predCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Hasil prediksi tidak ditemukan.'
      });
    }

    const id = crypto.randomUUID();
    const file_url = `http://localhost:5000/reports/${nama_file}`; // Dummy URL lokal

    await pool.query(
      `INSERT INTO laporan (id, user_id, hasil_prediksi_id, nama_file, file_url, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [id, userId, hasil_prediksi_id, nama_file, file_url]
    );

    res.status(201).json({
      success: true,
      message: 'Log laporan berhasil dicatat.',
      data: { id, nama_file, file_url }
    });

  } catch (error) {
    console.error('Error di laporanController (createLaporan):', error.message);
    res.status(500).json({
      success: false,
      message: 'Gagal mencatat log laporan.'
    });
  }
};

module.exports = {
  getLaporan,
  createLaporan
};
