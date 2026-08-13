const { pool } = require('../config/db');

// @desc    Mengambil semua data artikel edukasi dengan search dan category filter
// @route   GET /api/edukasi
// @access  Public
const getSemuaEdukasi = async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 12;
    const search = req.query.search || '';
    const category = req.query.category || 'all';

    let queryText = 'SELECT id, judul, isi, gambar, created_at FROM edukasi';
    const queryParams = [];
    let paramCounter = 1;

    if (search) {
      queryText += ` WHERE judul ILIKE $${paramCounter} OR isi ILIKE $${paramCounter}`;
      queryParams.push(`%${search}%`);
      paramCounter++;
    }

    const dbRes = await pool.query(queryText + ' ORDER BY created_at ASC', queryParams);
    
    // Map kategori secara dinamis berdasarkan konten untuk mencocokkan UI (Panduan, Mitigasi, Informasi)
    let articles = dbRes.rows.map(row => {
      let kategori = 'Informasi';
      const judulLower = row.judul.toLowerCase();
      if (judulLower.includes('aman') || judulLower.includes('keselamatan') || judulLower.includes('langkah')) {
        kategori = 'Panduan';
      } else if (judulLower.includes('lindungi') || judulLower.includes('surge') || judulLower.includes('mitigasi')) {
        kategori = 'Mitigasi';
      }
      
      return {
        id: row.id,
        judul: row.judul,
        isi: row.isi,
        gambar: row.gambar,
        kategori: kategori,
        created_at: row.created_at
      };
    });

    // Terapkan filter kategori jika dispesifikasikan
    if (category && category !== 'all' && category !== 'Semua') {
      articles = articles.filter(a => a.kategori.toLowerCase() === category.toLowerCase());
    }

    res.status(200).json({
      success: true,
      data: articles.slice(0, limit),
      total: articles.length
    });
  } catch (error) {
    console.error("Error di edukasiController (getSemuaEdukasi):", error.message);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data edukasi dari database."
    });
  }
};

// @desc    Mengambil detail artikel edukasi berdasarkan ID
// @route   GET /api/edukasi/:id
// @access  Public
const getEdukasiById = async (req, res) => {
  try {
    const { id } = req.params;
    const dbRes = await pool.query('SELECT id, judul, isi, gambar, created_at FROM edukasi WHERE id = $1', [id]);

    if (dbRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Artikel edukasi tidak ditemukan.'
      });
    }

    const row = dbRes.rows[0];
    let kategori = 'Informasi';
    const judulLower = row.judul.toLowerCase();
    if (judulLower.includes('aman') || judulLower.includes('keselamatan') || judulLower.includes('langkah')) {
      kategori = 'Panduan';
    } else if (judulLower.includes('lindungi') || judulLower.includes('surge') || judulLower.includes('mitigasi')) {
      kategori = 'Mitigasi';
    }

    res.status(200).json({
      success: true,
      data: {
        id: row.id,
        judul: row.judul,
        isi: row.isi,
        gambar: row.gambar,
        kategori: kategori,
        created_at: row.created_at
      }
    });
  } catch (error) {
    console.error("Error di edukasiController (getEdukasiById):", error.message);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil detail artikel edukasi."
    });
  }
};

module.exports = {
  getSemuaEdukasi,
  getEdukasiById
};
