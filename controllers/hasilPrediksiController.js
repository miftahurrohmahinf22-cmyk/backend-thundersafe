const { pool } = require('../config/db');

// @desc    Ambil riwayat prediksi cuaca milik user (dengan Search, Filter, Sort, Pagination)
// @route   GET /api/history
// @access  Private
const getHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    let { search, filter, sort, page, limit, locationId, lokasi_id } = req.query;
    const selectedLocId = locationId || lokasi_id;

    // Set default parameter paginasi
    page = parseInt(page, 10) || 1;
    limit = parseInt(limit, 10) || 10;
    const offset = (page - 1) * limit;

    // Query dasar
    let queryText = `
      FROM hasil_prediksi hp
      JOIN data_cuaca dc ON hp.data_cuaca_id = dc.id
      JOIN lokasi l ON dc.lokasi_id = l.id
      WHERE 1=1
    `;
    const queryParams = [];
    let paramCounter = 1;

    // Tambah filter Lokasi Stasiun
    if (selectedLocId && selectedLocId !== 'all' && selectedLocId !== 'Semua') {
      queryText += ` AND l.id = $${paramCounter}`;
      queryParams.push(selectedLocId);
      paramCounter++;
    }

    // Tambah filter Search (berdasarkan nama lokasi atau kabupaten)
    if (search) {
      queryText += ` AND (l.nama_pos ILIKE $${paramCounter} OR l.kabupaten ILIKE $${paramCounter})`;
      queryParams.push(`%${search}%`);
      paramCounter++;
    }

    // Tambah filter Tingkat Risiko (Rendah, Sedang, Tinggi)
    if (filter && filter !== 'all' && filter !== 'Semua') {
      // Map input filter bahasa indonesia / inggris
      let mappedFilter = filter;
      if (filter === 'Rendah' || filter === 'Aman') mappedFilter = 'Rendah';
      else if (filter === 'Sedang' || filter === 'Waspada') mappedFilter = 'Sedang';
      else if (filter === 'Tinggi' || filter === 'Bahaya') mappedFilter = 'Tinggi';

      queryText += ` AND hp.tingkat_risiko = $${paramCounter}`;
      queryParams.push(mappedFilter);
      paramCounter++;
    }

    // Hitung total item yang cocok (untuk meta paginasi)
    const countQuery = `SELECT COUNT(*) ${queryText}`;
    const countRes = await pool.query(countQuery, queryParams);
    const totalItems = parseInt(countRes.rows[0].count, 10);
    const totalPages = Math.ceil(totalItems / limit);

    // Tambah Sorting (menggunakan waktu_pengamatan sebagai acuan waktu observasi)
    let orderBy = 'ORDER BY dc.waktu_pengamatan DESC, hp.created_at DESC';
    if (sort) {
      if (sort === 'oldest') {
        orderBy = 'ORDER BY dc.waktu_pengamatan ASC, hp.created_at ASC';
      } else if (sort === 'confidence_high') {
        orderBy = 'ORDER BY hp.probabilitas DESC, dc.waktu_pengamatan DESC';
      } else if (sort === 'confidence_low') {
        orderBy = 'ORDER BY hp.probabilitas ASC, dc.waktu_pengamatan DESC';
      }
    }

    // Gabungkan query final dengan select, order, limit, offset
    const selectQuery = `
      SELECT hp.id as hasil_prediksi_id, hp.probabilitas, hp.tingkat_risiko, hp.warna_marker, hp.rekomendasi, hp.created_at,
             dc.id as data_cuaca_id, dc.suhu, dc.kelembapan, dc.kecepatan_angin, dc.curah_hujan, dc.tekanan_udara, dc.aktivitas_petir, dc.waktu_pengamatan,
             l.id as lokasi_id, l.nama_pos, l.kawasan, l.desa, l.kecamatan, l.kabupaten, l.latitude, l.longtitude
      ${queryText}
      ${orderBy}
      LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
    `;

    queryParams.push(limit);
    queryParams.push(offset);

    const historyRes = await pool.query(selectQuery, queryParams);

    res.status(200).json({
      success: true,
      data: historyRes.rows,
      pagination: {
        totalItems,
        totalPages,
        currentPage: page,
        limit
      }
    });

  } catch (error) {
    console.error('Error di hasilPrediksiController (getHistory):', error.message);
    res.status(500).json({
      success: false,
      message: 'Gagal memuat riwayat prediksi.'
    });
  }
};

// @desc    Hapus riwayat prediksi cuaca
// @route   DELETE /api/history/:id
// @access  Private
const deleteHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params; // ini hasil_prediksi_id

    // 1. Verifikasi kepemilikan data sebelum menghapus
    const recordCheckRes = await pool.query(
      `SELECT hp.id, hp.data_cuaca_id 
       FROM hasil_prediksi hp
       JOIN data_cuaca dc ON hp.data_cuaca_id = dc.id
       WHERE hp.id = $1 AND dc.created_by = $2`,
      [id, userId]
    );

    if (recordCheckRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Riwayat tidak ditemukan atau Anda tidak memiliki akses untuk menghapusnya.'
      });
    }

    const dataCuacaId = recordCheckRes.rows[0].data_cuaca_id;

    // Hapus relasi notifikasi jika ada
    await pool.query('DELETE FROM notifikasi WHERE hasil_prediksi_id = $1', [id]);

    // Hapus laporan jika ada
    await pool.query('DELETE FROM laporan WHERE hasil_prediksi_id = $1', [id]);

    // Hapus dari hasil_prediksi
    await pool.query('DELETE FROM hasil_prediksi WHERE id = $1', [id]);

    // Hapus dari data_cuaca
    await pool.query('DELETE FROM data_cuaca WHERE id = $1', [dataCuacaId]);

    res.status(200).json({
      success: true,
      message: 'Riwayat prediksi berhasil dihapus.'
    });

  } catch (error) {
    console.error('Error di hasilPrediksiController (deleteHistory):', error.message);
    res.status(500).json({
      success: false,
      message: 'Gagal menghapus riwayat prediksi.'
    });
  }
};

module.exports = {
  getHistory,
  deleteHistory
};
