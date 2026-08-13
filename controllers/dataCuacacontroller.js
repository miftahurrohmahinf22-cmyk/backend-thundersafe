const { pool } = require('../config/db');

// @desc    Mengambil data parameter cuaca BMKG terbaru dari PostgreSQL
// @route   GET /api/cuaca/terbaru
// @access  Public
const getCuacaTerbaru = async (req, res) => {
  try {
    const latestRes = await pool.query(`
      SELECT dc.suhu, dc.kelembapan, dc.kecepatan_angin, dc.curah_hujan, dc.tekanan_udara, dc.waktu_pengamatan,
             l.nama_pos, hp.tingkat_risiko, hp.probabilitas
      FROM data_cuaca dc
      JOIN lokasi l ON dc.lokasi_id = l.id
      LEFT JOIN hasil_prediksi hp ON hp.data_cuaca_id = dc.id
      ORDER BY dc.waktu_pengamatan DESC, dc.created_at DESC
      LIMIT 1
    `);

    if (latestRes.rows.length > 0) {
      const row = latestRes.rows[0];
      return res.status(200).json({
        success: true,
        suhu: parseFloat(row.suhu),
        kelembapan: parseFloat(row.kelembapan),
        kecepatan_angin: parseFloat(row.kecepatan_angin),
        curah_hujan: parseFloat(row.curah_hujan),
        tekanan_udara: parseFloat(row.tekanan_udara),
        status: row.tingkat_risiko || "Rendah",
        probabilitas: row.probabilitas || "100",
        lokasi: row.nama_pos,
        waktu_pengamatan: row.waktu_pengamatan
      });
    }

    res.status(200).json({
      success: false,
      message: 'Belum ada data cuaca BMKG terdaftar.'
    });
  } catch (error) {
    console.error("Error di dataCuacacontroller:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getCuacaTerbaru
};