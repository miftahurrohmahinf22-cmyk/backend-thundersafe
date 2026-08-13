const { pool } = require('../config/db');
const { predictNaiveBayes } = require('../services/naiveBayes');

// @desc    Ambil daftar lokasi pemantauan cuaca dan tingkat risikonya
// @route   GET /api/lokasi
// @access  Public
const getLokasi = async (req, res) => {
  try {
    // Ambil semua lokasi stasiun pemantauan dari database
    const lokasiRes = await pool.query('SELECT * FROM lokasi ORDER BY created_at ASC');
    const locations = lokasiRes.rows;

    const results = [];

    for (let loc of locations) {
      // Ambil data riwayat prediksi cuaca TERAKHIR untuk lokasi ini dari database berdasarkan waktu_pengamatan
      const latestPredRes = await pool.query(
        `SELECT hp.tingkat_risiko, hp.warna_marker, hp.probabilitas, hp.rekomendasi, hp.created_at,
                dc.suhu, dc.kelembapan, dc.kecepatan_angin, dc.curah_hujan, dc.tekanan_udara, dc.aktivitas_petir, dc.waktu_pengamatan
         FROM hasil_prediksi hp
         JOIN data_cuaca dc ON hp.data_cuaca_id = dc.id
         WHERE hp.lokasi_id = $1
         ORDER BY dc.waktu_pengamatan DESC, hp.created_at DESC
         LIMIT 1`,
        [loc.id]
      );

      let currentData = {};

      if (latestPredRes.rows.length > 0) {
        const row = latestPredRes.rows[0];
        currentData = {
          suhu: parseFloat(row.suhu),
          kelembapan: parseFloat(row.kelembapan),
          kecepatan_angin: parseFloat(row.kecepatan_angin),
          curah_hujan: parseFloat(row.curah_hujan),
          tekanan_udara: parseFloat(row.tekanan_udara),
          aktivitas_petir: row.aktivitas_petir !== null ? parseInt(row.aktivitas_petir, 10) : null,
          tingkat_risiko: row.tingkat_risiko,
          warna_marker: row.warna_marker,
          probabilitas: parseFloat(row.probabilitas),
          rekomendasi: row.rekomendasi,
          waktu_pengamatan: row.waktu_pengamatan
        };
      } else {
        currentData = {
          suhu: null,
          kelembapan: null,
          kecepatan_angin: null,
          curah_hujan: null,
          tekanan_udara: null,
          aktivitas_petir: null,
          tingkat_risiko: 'Rendah',
          warna_marker: 'green',
          probabilitas: 100,
          rekomendasi: 'Belum ada data observasi untuk stasiun ini.'
        };
      }

      results.push({
        id: loc.id,
        nama_pos: loc.nama_pos,
        kawasan: loc.kawasan,
        desa: loc.desa,
        kecamatan: loc.kecamatan,
        kabupaten: loc.kabupaten,
        latitude: parseFloat(loc.latitude),
        longtitude: parseFloat(loc.longtitude),
        current: currentData
      });
    }

    res.status(200).json({
      success: true,
      data: results
    });

  } catch (error) {
    console.error('Error di lokasiController:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gagal memuat peta lokasi risiko.'
    });
  }
};

module.exports = {
  getLokasi
};
