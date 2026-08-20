const { pool } = require('../config/db');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { predictNaiveBayes, trainNaiveBayesModel, predictWithModel } = require('../services/naiveBayes');
const { broadcastNotifEvent } = require('./notifikasiController');
const settingsPath = path.join(__dirname, '../config/system_settings.json');

// --- Statistik Global ---
const getStatistik = async (req, res) => {
  try {
    const totalUsers = await pool.query('SELECT COUNT(*) FROM "User"');
    const totalPrediksi = await pool.query('SELECT COUNT(*) FROM hasil_prediksi');
    const totalDataset = await pool.query('SELECT COUNT(*) FROM dataset_training');
    const totalRisikoRendah = await pool.query("SELECT COUNT(*) FROM hasil_prediksi WHERE tingkat_risiko = 'Rendah'");
    const totalRisikoSedang = await pool.query("SELECT COUNT(*) FROM hasil_prediksi WHERE tingkat_risiko = 'Sedang'");
    const totalRisikoTinggi = await pool.query("SELECT COUNT(*) FROM hasil_prediksi WHERE tingkat_risiko = 'Tinggi'");
    const totalNotifikasi = await pool.query("SELECT COUNT(*) FROM notifikasi");
    const totalLokasi = await pool.query("SELECT COUNT(*) FROM lokasi");
    const totalArtikel = await pool.query("SELECT COUNT(*) FROM edukasi");
    const totalDataCuaca = await pool.query("SELECT COUNT(*) FROM data_cuaca");

    const totalPredNum = parseInt(totalPrediksi.rows[0].count, 10) || 1;
    const rCount = parseInt(totalRisikoRendah.rows[0].count, 10);
    const sCount = parseInt(totalRisikoSedang.rows[0].count, 10);
    const tCount = parseInt(totalRisikoTinggi.rows[0].count, 10);

    const pct_rendah = Math.round((rCount / totalPredNum) * 100);
    const pct_sedang = Math.round((sCount / totalPredNum) * 100);
    const pct_tinggi = Math.round((tCount / totalPredNum) * 100);
    
    // Ambil aktivitas prediksi terbaru
    const recentActivity = await pool.query(`
      SELECT hp.id, u.nama, l.nama_pos, hp.tingkat_risiko, hp.created_at, dc.waktu_pengamatan
      FROM hasil_prediksi hp
      JOIN data_cuaca dc ON hp.data_cuaca_id = dc.id
      LEFT JOIN "User" u ON dc.created_by = u.id
      JOIN lokasi l ON dc.lokasi_id = l.id
      ORDER BY dc.waktu_pengamatan DESC, hp.created_at DESC
      LIMIT 5
    `);

    // Ambil 5 user terbaru
    const latestUsers = await pool.query(`
      SELECT id, nama, email, role, create_at as created_at
      FROM "User"
      ORDER BY create_at DESC
      LIMIT 5
    `);

    // Ambil 1 data cuaca / BMKG terbaru berdasarkan waktu_pengamatan
    const latestBMKGRes = await pool.query(`
      SELECT dc.*, l.nama_pos 
      FROM data_cuaca dc
      JOIN lokasi l ON dc.lokasi_id = l.id
      ORDER BY dc.waktu_pengamatan DESC, dc.created_at DESC
      LIMIT 1
    `);
    const latestBMKG = latestBMKGRes.rows.length > 0 ? latestBMKGRes.rows[0] : null;

    // Read system settings for status
    let systemStatus = "Active";
    try {
      if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        if (settings.maintenance_mode) systemStatus = "Maintenance";
      }
    } catch (e) {
      console.error(e);
    }

    res.status(200).json({
      success: true,
      data: {
        total_users: parseInt(totalUsers.rows[0].count, 10),
        total_prediksi: parseInt(totalPrediksi.rows[0].count, 10),
        total_dataset: parseInt(totalDataset.rows[0].count, 10),
        total_risiko_rendah: rCount,
        total_risiko_sedang: sCount,
        total_risiko_tinggi: tCount,
        pct_rendah,
        pct_sedang,
        pct_tinggi,
        total_notifikasi: parseInt(totalNotifikasi.rows[0].count, 10),
        total_lokasi: parseInt(totalLokasi.rows[0].count, 10),
        total_artikel: parseInt(totalArtikel.rows[0].count, 10),
        total_data_cuaca: parseInt(totalDataCuaca.rows[0].count, 10),
        recent_activity: recentActivity.rows,
        latest_users: latestUsers.rows,
        latest_bmkg: latestBMKG,
        system_status: systemStatus
      }
    });
  } catch (error) {
    console.error('Error di adminController (getStatistik):', error.message);
    res.status(500).json({ success: false, message: 'Gagal mengambil statistik global.' });
  }
};

// --- Kelola User ---
const getSemuaUser = async (req, res) => {
  try {
    const users = await pool.query('SELECT id, nama, email, role, create_at as created_at FROM "User" ORDER BY create_at DESC');
    res.status(200).json({ success: true, data: users.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal mengambil data pengguna.' });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    // Jangan izinkan hapus diri sendiri jika admin
    if (id === req.user.id) {
      return res.status(400).json({ success: false, message: 'Tidak dapat menghapus akun Anda sendiri saat sedang login.' });
    }
    // Delete cascade dependencies manual jika tidak diset cascade di DB
    await pool.query('DELETE FROM notifikasi WHERE user_id = $1', [id]);
    await pool.query('DELETE FROM laporan WHERE user_id = $1', [id]);
    
    // Ambil data cuaca yang dibuat user ini untuk didelete
    const dataCuacaRes = await pool.query('SELECT id FROM data_cuaca WHERE created_by = $1', [id]);
    for (let row of dataCuacaRes.rows) {
      await pool.query('DELETE FROM hasil_prediksi WHERE data_cuaca_id = $1', [row.id]);
      await pool.query('DELETE FROM data_cuaca WHERE id = $1', [row.id]);
    }

    await pool.query('DELETE FROM "User" WHERE id = $1', [id]);
    res.status(200).json({ success: true, message: 'Pengguna berhasil dihapus.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Gagal menghapus pengguna.' });
  }
};

// --- Kelola Dataset Training ---
const getDataset = async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const offset = Number(req.query.offset) || 0;
    const search = req.query.search || '';

    let queryText = 'SELECT * FROM dataset_training';
    const queryParams = [];
    
    if (search) {
      queryText += ' WHERE kelas_risiko ILIKE $1';
      queryParams.push(`%${search}%`);
    }

    queryText += ` ORDER BY suhu ASC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
    queryParams.push(limit, offset);

    const dataset = await pool.query(queryText, queryParams);
    
    // Total count for pagination
    let countQuery = 'SELECT COUNT(*) FROM dataset_training';
    let countParams = [];
    if (search) {
      countQuery += ' WHERE kelas_risiko ILIKE $1';
      countParams.push(`%${search}%`);
    }
    const countRes = await pool.query(countQuery, countParams);

    res.status(200).json({
      success: true,
      data: dataset.rows,
      total: parseInt(countRes.rows[0].count, 10)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Gagal mengambil data latih.' });
  }
};

const addDataset = async (req, res) => {
  try {
    const { suhu, kelembapan, kecepatan_angin, curah_hujan, tekanan_udara, aktivitas_petir, kelas_risiko } = req.body;
    await pool.query(
      `INSERT INTO dataset_training (id, suhu, kelembapan, kecepatan_angin, curah_hujan, tekanan_udara, aktivitas_petir, kelas_risiko)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [crypto.randomUUID(), suhu, kelembapan, kecepatan_angin, curah_hujan, tekanan_udara, aktivitas_petir, kelas_risiko]
    );
    res.status(201).json({ success: true, message: 'Data latih berhasil ditambahkan.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal menambahkan data latih.' });
  }
};

const deleteDataset = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM dataset_training WHERE id = $1', [id]);
    res.status(200).json({ success: true, message: 'Data latih berhasil dihapus.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal menghapus data latih.' });
  }
};

// --- Kelola Edukasi ---
const tambahEdukasi = async (req, res) => {
  try {
    const { judul, isi, gambar } = req.body;
    await pool.query(
      `INSERT INTO edukasi (id, judul, isi, gambar, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [crypto.randomUUID(), judul, isi, gambar]
    );
    res.status(201).json({ success: true, message: 'Artikel edukasi berhasil ditambahkan.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal menambahkan artikel edukasi.' });
  }
};

const hapusEdukasi = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM edukasi WHERE id = $1', [id]);
    res.status(200).json({ success: true, message: 'Artikel edukasi berhasil dihapus.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal menghapus artikel edukasi.' });
  }
};

// --- Kelola Lokasi ---
const tambahLokasi = async (req, res) => {
  try {
    const { nama_pos, kawasan, desa, kecamatan, kabupaten, latitude, longtitude } = req.body;
    await pool.query(
      `INSERT INTO lokasi (id, nama_pos, kawasan, desa, kecamatan, kabupaten, latitude, longtitude, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [crypto.randomUUID(), nama_pos, kawasan, desa, kecamatan, kabupaten, latitude, longtitude]
    );
    res.status(201).json({ success: true, message: 'Lokasi pemantauan berhasil ditambahkan.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Gagal menambahkan lokasi.' });
  }
};

const hapusLokasi = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query('BEGIN');
    await client.query(`DELETE FROM laporan WHERE hasil_prediksi_id IN (SELECT id FROM hasil_prediksi WHERE lokasi_id = $1)`, [id]);
    await client.query(`DELETE FROM notifikasi WHERE hasil_prediksi_id IN (SELECT id FROM hasil_prediksi WHERE lokasi_id = $1)`, [id]);
    await client.query(`DELETE FROM hasil_prediksi WHERE lokasi_id = $1`, [id]);
    await client.query(`DELETE FROM data_cuaca WHERE lokasi_id = $1`, [id]);
    await client.query(`DELETE FROM lokasi WHERE id = $1`, [id]);
    await client.query('COMMIT');
    res.status(200).json({ success: true, message: 'Stasiun lokasi dan data terkait berhasil dihapus.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error di hapusLokasi:', error.message);
    res.status(500).json({ success: false, message: 'Gagal menghapus lokasi: ' + error.message });
  } finally {
    client.release();
  }
};

// --- Kelola Prediksi & Riwayat Global ---
const getSemuaPrediksi = async (req, res) => {
  try {
    let { search, filter, sort, page, limit } = req.query;
    page = parseInt(page, 10) || 1;
    limit = parseInt(limit, 10) || 10;
    const offset = (page - 1) * limit;

    let queryText = `
      FROM hasil_prediksi hp
      JOIN data_cuaca dc ON hp.data_cuaca_id = dc.id
      JOIN lokasi l ON dc.lokasi_id = l.id
      LEFT JOIN "User" u ON dc.created_by = u.id
      WHERE 1=1
    `;
    const queryParams = [];
    let paramCounter = 1;

    if (search) {
      queryText += ` AND (l.nama_pos ILIKE $${paramCounter} OR u.nama ILIKE $${paramCounter} OR l.kabupaten ILIKE $${paramCounter})`;
      queryParams.push(`%${search}%`);
      paramCounter++;
    }

    if (filter && filter !== 'all' && filter !== 'Semua') {
      let mappedFilter = filter;
      if (filter === 'Rendah' || filter === 'Aman') mappedFilter = 'Rendah';
      else if (filter === 'Sedang' || filter === 'Waspada') mappedFilter = 'Sedang';
      else if (filter === 'Tinggi' || filter === 'Bahaya') mappedFilter = 'Tinggi';

      queryText += ` AND hp.tingkat_risiko = $${paramCounter}`;
      queryParams.push(mappedFilter);
      paramCounter++;
    }

    const countQuery = `SELECT COUNT(*) ${queryText}`;
    const countRes = await pool.query(countQuery, queryParams);
    const totalItems = parseInt(countRes.rows[0].count, 10);
    const totalPages = Math.ceil(totalItems / limit);

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

    const selectQuery = `
      SELECT hp.id as hasil_prediksi_id, hp.probabilitas, hp.tingkat_risiko, hp.warna_marker, hp.rekomendasi, hp.created_at,
             dc.id as data_cuaca_id, dc.suhu, dc.kelembapan, dc.kecepatan_angin, dc.curah_hujan, dc.tekanan_udara, dc.aktivitas_petir,
             l.nama_pos, l.kawasan, l.desa, l.kecamatan, l.kabupaten, l.latitude, l.longtitude,
             u.nama as user_nama, u.email as user_email
      ${queryText}
      ${orderBy}
      LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
    `;
    
    queryParams.push(limit, offset);

    const result = await pool.query(selectQuery, queryParams);

    res.status(200).json({
      success: true,
      data: result.rows,
      pagination: {
        totalItems,
        totalPages,
        currentPage: page,
        limit
      }
    });
  } catch (error) {
    console.error('Error di getSemuaPrediksi:', error.message);
    res.status(500).json({ success: false, message: 'Gagal mengambil data prediksi global.' });
  }
};

const hapusPrediksi = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    const recordCheck = await client.query('SELECT data_cuaca_id FROM hasil_prediksi WHERE id = $1', [id]);
    if (recordCheck.rows.length === 0) {
      client.release();
      return res.status(404).json({ success: false, message: 'Data prediksi tidak ditemukan.' });
    }
    const dataCuacaId = recordCheck.rows[0].data_cuaca_id;

    await client.query('BEGIN');
    await client.query('DELETE FROM notifikasi WHERE hasil_prediksi_id = $1', [id]);
    await client.query('DELETE FROM laporan WHERE hasil_prediksi_id = $1', [id]);
    await client.query('DELETE FROM hasil_prediksi WHERE id = $1', [id]);
    if (dataCuacaId) {
      await client.query('DELETE FROM data_cuaca WHERE id = $1', [dataCuacaId]);
    }
    await client.query('COMMIT');

    res.status(200).json({ success: true, message: 'Data observasi dan prediksi berhasil dihapus.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error di hapusPrediksi:', error.message);
    res.status(500).json({ success: false, message: 'Gagal menghapus data prediksi: ' + error.message });
  } finally {
    client.release();
  }
};

const clearAllPrediksi = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM notifikasi WHERE hasil_prediksi_id IS NOT NULL');
    await client.query('DELETE FROM laporan WHERE hasil_prediksi_id IS NOT NULL');
    await client.query('DELETE FROM hasil_prediksi');
    await client.query('DELETE FROM data_cuaca');
    await client.query('COMMIT');

    res.status(200).json({ success: true, message: 'Seluruh data observasi dan prediksi berhasil dibersihkan.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error di clearAllPrediksi:', error.message);
    res.status(500).json({ success: false, message: 'Gagal membersihkan data: ' + error.message });
  } finally {
    client.release();
  }
};

const isValidUUID = (str) => {
  return typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
};

// --- Kelola Notifikasi ---
const getSemuaNotifikasi = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT n.id, n.judul, n.pesan, n.status_baca, n.created_at,
             COALESCE(u.nama, 'Pengguna') as user_nama,
             COALESCE(u.email, '-') as user_email
      FROM notifikasi n
      LEFT JOIN "User" u ON n.user_id = u.id
      ORDER BY n.created_at DESC
      LIMIT 100
    `);
    res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error di getSemuaNotifikasi:', error.message);
    res.status(500).json({ success: false, message: 'Gagal mengambil data notifikasi.' });
  }
};

const buatNotifikasi = async (req, res) => {
  try {
    const { user_id, judul, pesan, hasil_prediksi_id } = req.body;
    if (!judul || !pesan) {
      return res.status(400).json({ success: false, message: 'Judul dan pesan tidak boleh kosong.' });
    }

    let validHpId = null;
    if (hasil_prediksi_id && isValidUUID(hasil_prediksi_id)) {
      const hpCheck = await pool.query('SELECT id FROM hasil_prediksi WHERE id = $1', [hasil_prediksi_id]);
      if (hpCheck.rows.length > 0) validHpId = hpCheck.rows[0].id;
    }

    const now = new Date();
    const isSingleUser = isValidUUID(user_id);

    if (isSingleUser) {
      const userCheck = await pool.query('SELECT id FROM "User" WHERE id = $1', [user_id]);
      if (userCheck.rows.length > 0) {
        const newNotifId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO notifikasi (id, user_id, hasil_prediksi_id, judul, pesan, status_baca, created_at)
           VALUES ($1, $2, $3, $4, $5, false, NOW())`,
          [newNotifId, user_id, validHpId, judul, pesan]
        );
      } else {
        return res.status(404).json({ success: false, message: 'Pengguna penerima tidak ditemukan.' });
      }
    } else {
      const usersRes = await pool.query('SELECT id FROM "User"');
      for (let userRow of usersRes.rows) {
        await pool.query(
          `INSERT INTO notifikasi (id, user_id, hasil_prediksi_id, judul, pesan, status_baca, created_at)
           VALUES ($1, $2, $3, $4, $5, false, NOW())`,
          [crypto.randomUUID(), userRow.id, validHpId, judul, pesan]
        );
      }
    }

    // Broadcast ke SSE listeners secara real-time
    broadcastNotifEvent({
      id: crypto.randomUUID(),
      user_id: isSingleUser ? user_id : 'all',
      judul,
      pesan,
      status_baca: false,
      created_at: now.toISOString()
    });

    res.status(201).json({ success: true, message: 'Notifikasi berhasil dikirim.' });
  } catch (error) {
    console.error('Error di buatNotifikasi:', error.message);
    res.status(500).json({ success: false, message: 'Gagal membuat notifikasi: ' + error.message });
  }
};

const hapusNotifikasi = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM notifikasi WHERE id = $1', [id]);
    res.status(200).json({ success: true, message: 'Notifikasi berhasil dihapus.' });
  } catch (error) {
    console.error('Error di hapusNotifikasi:', error.message);
    res.status(500).json({ success: false, message: 'Gagal menghapus notifikasi.' });
  }
};

// --- System Settings ---
const getSystemSettings = async (req, res) => {
  try {
    if (!fs.existsSync(settingsPath)) {
      const defaultSettings = {
        threshold_high: 75,
        threshold_medium: 45,
        maintenance_mode: false,
        alert_system_active: true,
        data_sync_interval: 30
      };
      fs.writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2), 'utf8');
      return res.status(200).json({ success: true, data: defaultSettings });
    }
    const data = fs.readFileSync(settingsPath, 'utf8');
    res.status(200).json({ success: true, data: JSON.parse(data) });
  } catch (error) {
    console.error('Error di getSystemSettings:', error.message);
    res.status(500).json({ success: false, message: 'Gagal membaca pengaturan sistem.' });
  }
};

const updateSystemSettings = async (req, res) => {
  try {
    const newSettings = req.body;
    fs.writeFileSync(settingsPath, JSON.stringify(newSettings, null, 2), 'utf8');
    res.status(200).json({ success: true, message: 'Pengaturan sistem berhasil disimpan.', data: newSettings });
  } catch (error) {
    console.error('Error di updateSystemSettings:', error.message);
    res.status(500).json({ success: false, message: 'Gagal menyimpan pengaturan sistem.' });
  }
};

const getSemuaLaporan = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT lap.id, lap.nama_file, lap.file_url, lap.created_at,
             u.nama as user_nama, u.email as user_email,
             hp.tingkat_risiko, hp.probabilitas, l.nama_pos
      FROM laporan lap
      JOIN "User" u ON lap.user_id = u.id
      JOIN hasil_prediksi hp ON lap.hasil_prediksi_id = hp.id
      JOIN lokasi l ON hp.lokasi_id = l.id
      ORDER BY lap.created_at DESC
    `);
    res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error di getSemuaLaporan:', error.message);
    res.status(500).json({ success: false, message: 'Gagal mengambil log laporan.' });
  }
};

const hapusLaporan = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM laporan WHERE id = $1', [id]);
res.status(200).json({ success: true, message: 'Log laporan berhasil dihapus.' });
  } catch (error) {
    console.error('Error di hapusLaporan:', error.message);
    res.status(500).json({ success: false, message: 'Gagal menghapus log laporan.' });
  }
};

const parseIndonesianDate = (rawStr) => {
  if (!rawStr) return new Date();
  const str = String(rawStr).trim();
  if (!str) return new Date();

  // 1. Standar ISO / Date.parse (e.g. YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ)
  if (!isNaN(Date.parse(str))) {
    return new Date(str);
  }

  // 2. Format Indonesia DD-MM-YYYY atau DD/MM/YYYY atau DD-MM-YYYY HH:mm:ss
  const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const hour = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0;
    const minute = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
    const second = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
    const d = new Date(year, month, day, hour, minute, second);
    if (!isNaN(d.getTime())) return d;
  }

  // 3. Format YYYY-MM-DD atau YYYY/MM/DD dengan jam
  const ymdMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const hour = ymdMatch[4] ? parseInt(ymdMatch[4], 10) : 0;
    const minute = ymdMatch[5] ? parseInt(ymdMatch[5], 10) : 0;
    const second = ymdMatch[6] ? parseInt(ymdMatch[6], 10) : 0;
    const d = new Date(year, month, day, hour, minute, second);
    if (!isNaN(d.getTime())) return d;
  }

  // 4. Standar Serial Date Excel (misal: 45657.2916666667)
  if (!isNaN(parseFloat(str))) {
    const num = parseFloat(str);
    if (num > 30000 && num < 70000) {
      const excelEpoch = new Date(1899, 11, 30);
      const d = new Date(excelEpoch.getTime() + num * 86400000);
      if (!isNaN(d.getTime())) return d;
    }
  }

  return new Date();
};

const importCSVDataBMKG = async (req, res) => {
  const startTime = Date.now();
  const client = await pool.connect();

  try {
    const adminId = req.user.id;
    const { csvText } = req.body;

    if (!csvText) {
      client.release();
      return res.status(400).json({
        success: false,
        message: 'Konten CSV tidak boleh kosong.'
      });
    }

    const lines = csvText.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
    if (lines.length <= 1) {
      client.release();
      return res.status(400).json({
        success: false,
        message: 'File CSV tidak berisi data yang cukup.'
      });
    }

    console.log(`[IMPORT] Start: ${lines.length - 1} rows from CSV payload`);

    // Deteksi pembatas otomatis (koma atau titik koma)
    const firstLine = lines[0];
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semiCount = (firstLine.match(/;/g) || []).length;
    const delimiter = semiCount > commaCount ? ';' : ',';

    // Parse header (dukung Format A & Format B BMKG)
    const headers = firstLine.toLowerCase().split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));
    
    const findHeaderIndex = (possibleNames) => {
      for (const name of possibleNames) {
        const idx = headers.indexOf(name.toLowerCase());
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const stationIdIdx = findHeaderIndex(['station_id', 'id_stasiun']);
    const namePosIdx = findHeaderIndex(['station_name', 'nama_pos', 'stasiun', 'nama_stasiun']);
    const latIdx = findHeaderIndex(['current_latitude', 'latitude', 'lat']);
    const lonIdx = findHeaderIndex(['current_longitude', 'longtitude', 'longitude', 'lon']);
    const timestampIdx = findHeaderIndex(['data_timestamp', 'waktu_pengamatan', 'waktu', 'tanggal']);
    const suhuIdx = findHeaderIndex(['suhu_avg_°C', 'suhu_avg_°c', 'suhu_avg_c', 'suhu', 'tavg']);
    const kelembapanIdx = findHeaderIndex(['rh_avg_%', 'kelembapan', 'kelembaban', 'rh_avg']);
    const kecAnginIdx = findHeaderIndex(['ff_avg_km/jm', 'ff_avg_km/jam', 'kecepatan_angin', 'ff_avg']);
    const curahHujanIdx = findHeaderIndex(['hujan_mm', 'curah_hujan', 'rr']);
    const tekananIdx = findHeaderIndex(['pp_qfe_mb', 'tekanan_udara', 'tekanan', 'pp_qfe']);
    const petirIdx = findHeaderIndex(['aktivitas_petir', 'petir']);

    const missing = [];
    if (namePosIdx === -1) missing.push('nama_pos/station_name');
    if (suhuIdx === -1) missing.push('suhu');
    if (kelembapanIdx === -1) missing.push('kelembapan');
    if (kecAnginIdx === -1) missing.push('kecepatan_angin');
    if (curahHujanIdx === -1) missing.push('curah_hujan');

    if (missing.length > 0) {
      client.release();
      return res.status(400).json({
        success: false,
        message: `Header CSV tidak sesuai. Kolom berikut hilang: ${missing.join(', ')}`
      });
    }

    // Mulai Transaksi PostgreSQL
    await client.query('BEGIN');

    // 1. Pre-load 92 data latih & latih parameter Naive Bayes sekali di memori (4 Fitur)
    const datasetRes = await client.query("SELECT suhu, kelembapan, curah_hujan, kecepatan_angin, kelas_risiko FROM dataset_training");
    const modelStats = trainNaiveBayesModel(datasetRes.rows);
    console.log(`[IMPORT] Training loaded & model pre-trained: ${datasetRes.rows.length} rows`);

    // 2. Pre-load lokasi terdaftar dari database
    const lokasiRes = await client.query('SELECT id, nama_pos FROM lokasi');
    const lokasiMap = {};
    lokasiRes.rows.forEach(loc => {
      lokasiMap[loc.nama_pos.toLowerCase().trim()] = loc.id;
    });

    const successRows = [];
    const errorRows = [];
    const duplicatesCheck = new Set();
    const preparedLocations = new Set();

    // 3. Process & validate rows in memory
    for (let i = 1; i < lines.length; i++) {
      const rowNum = i + 1;
      const row = lines[i].split(delimiter).map(val => val.trim().replace(/^["']|["']$/g, ''));

      if (row.length === 0 || (row.length === 1 && row[0] === '')) continue;

      const rawNamaPos = row[namePosIdx];
      const rawSuhu = row[suhuIdx];
      const rawKelembapan = row[kelembapanIdx];
      const rawKecAngin = row[kecAnginIdx];
      const rawCurahHujan = row[curahHujanIdx];
      const rawTekanan = tekananIdx !== -1 ? row[tekananIdx] : '1013.25';

      const rawLat = latIdx !== -1 ? row[latIdx] : null;
      const rawLon = lonIdx !== -1 ? row[lonIdx] : null;
      const rawTimestamp = timestampIdx !== -1 ? row[timestampIdx] : null;
      const rawPetir = petirIdx !== -1 ? row[petirIdx] : null;

      if (!rawNamaPos || rawSuhu === '' || rawKelembapan === '' || rawKecAngin === '' || rawCurahHujan === '') {
        errorRows.push({ row: rowNum, message: 'Terdapat kolom data cuaca yang kosong.' });
        continue;
      }

      const locNameKey = rawNamaPos.toLowerCase().trim();
      let lokasiId = lokasiMap[locNameKey];

      if (!lokasiId) {
        const newLocId = crypto.randomUUID();
        const latVal = rawLat && !isNaN(parseFloat(rawLat)) ? parseFloat(rawLat) : -7.8;
        const lonVal = rawLon && !isNaN(parseFloat(rawLon)) ? parseFloat(rawLon) : 110.3;
        
        await client.query(
          `INSERT INTO lokasi (id, nama_pos, kawasan, desa, kecamatan, kabupaten, latitude, longtitude, created_at)
           VALUES ($1, $2, 'Stasiun BMKG', 'Sleman', 'Sleman', 'Sleman', $3, $4, NOW())`,
          [newLocId, rawNamaPos, latVal, lonVal]
        );

        lokasiMap[locNameKey] = newLocId;
        lokasiId = newLocId;
        preparedLocations.add(rawNamaPos);
      }

      const suhu = parseFloat(rawSuhu);
      const kelembapan = parseFloat(rawKelembapan);
      const kecepatan_angin = parseFloat(rawKecAngin);
      const curah_hujan = parseFloat(rawCurahHujan);
      const tekanan_udara = rawTekanan && !isNaN(parseFloat(rawTekanan)) ? parseFloat(rawTekanan) : 1013.25;

      if (isNaN(suhu) || isNaN(kelembapan) || isNaN(kecepatan_angin) || isNaN(curah_hujan)) {
        errorRows.push({ row: rowNum, message: 'Parameter cuaca harus berupa angka valid.' });
        continue;
      }

      if (kelembapan < 0 || kelembapan > 100 || suhu < -10 || suhu > 55 || kecepatan_angin < 0 || curah_hujan < 0) {
        errorRows.push({ row: rowNum, message: 'Nilai parameter cuaca di luar batas normal.' });
        continue;
      }

      let aktivitasPetir = null;
      if (rawPetir !== null && rawPetir !== undefined && rawPetir !== '' && !isNaN(parseInt(rawPetir, 10))) {
        aktivitasPetir = parseInt(rawPetir, 10);
      }

      const waktuPengamatan = parseIndonesianDate(rawTimestamp);

      const duplicateKey = `${locNameKey}_${waktuPengamatan.toISOString()}_${suhu}_${kelembapan}_${kecepatan_angin}_${curah_hujan}`;
      if (duplicatesCheck.has(duplicateKey)) {
        errorRows.push({ row: rowNum, message: 'Data baris terdeteksi duplikat.' });
        continue;
      }
      duplicatesCheck.add(duplicateKey);

      successRows.push({
        lokasiId,
        namaPos: rawNamaPos,
        suhu,
        kelembapan,
        kecepatan_angin,
        curah_hujan,
        tekanan_udara,
        aktivitasPetir,
        waktuPengamatan
      });
    }

    console.log(`[IMPORT] Locations prepared: ${Object.keys(lokasiMap).length}`);

    // Deduplikasi in-memory: 1 data per stasiun per tanggal (YYYY-MM-DD)
    const seenImport = new Set();
    const uniqueSuccessRows = [];
    for (let r of successRows) {
      let dateKey = 'nodate';
      if (r.waktuPengamatan) {
        const d = new Date(r.waktuPengamatan);
        if (!isNaN(d.getTime())) {
          dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        } else {
          dateKey = String(r.waktuPengamatan).slice(0, 10);
        }
      }
      const uniqueKey = `${r.lokasiId}_${dateKey}`;
      if (!seenImport.has(uniqueKey)) {
        seenImport.add(uniqueKey);
        uniqueSuccessRows.push(r);
      }
    }

    // Bersihkan data cuaca impor sebelumnya agar tidak menumpuk duplikat hanya jika ada data baru yang valid
    if (uniqueSuccessRows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(400).json({
        success: false,
        message: `Gagal mengimpor: Tidak ada data valid yang dapat diproses. (${errorRows.length} baris bermasalah)`,
        summary: {
          totalCSV: lines.length - 1,
          successCount: 0,
          errorCount: errorRows.length,
          errors: errorRows
        }
      });
    }

    await client.query('DELETE FROM notifikasi WHERE hasil_prediksi_id IS NOT NULL');
    await client.query('DELETE FROM laporan WHERE hasil_prediksi_id IS NOT NULL');
    await client.query('DELETE FROM hasil_prediksi');
    await client.query('DELETE FROM data_cuaca');

    // 4. Batch Prepare Objects & Naive Bayes Predictions in Memory (4 Fitur)
    const dataCuacaBatch = [];
    const hasilPrediksiBatch = [];

    for (let dataItem of uniqueSuccessRows) {
      const predResult = predictWithModel(modelStats, {
        suhu: dataItem.suhu,
        kelembapan: dataItem.kelembapan,
        curah_hujan: dataItem.curah_hujan,
        kecepatan_angin: dataItem.kecepatan_angin
      });

      const dataCuacaId = crypto.randomUUID();
      const hasilPrediksiId = crypto.randomUUID();

      dataCuacaBatch.push({
        id: dataCuacaId,
        lokasi_id: dataItem.lokasiId,
        suhu: dataItem.suhu,
        kelembapan: dataItem.kelembapan,
        kecepatan_angin: dataItem.kecepatan_angin,
        curah_hujan: dataItem.curah_hujan,
        tekanan_udara: dataItem.tekanan_udara,
        aktivitas_petir: dataItem.aktivitasPetir,
        waktu_pengamatan: dataItem.waktuPengamatan,
        created_by: adminId
      });

      hasilPrediksiBatch.push({
        id: hasilPrediksiId,
        data_cuaca_id: dataCuacaId,
        lokasi_id: dataItem.lokasiId,
        probabilitas: predResult.confidence,
        tingkat_risiko: predResult.riskLevel,
        warna_marker: predResult.warna_marker,
        rekomendasi: predResult.recommendation,
        created_at: dataItem.waktuPengamatan
      });
    }

    console.log(`[IMPORT] Predictions generated in memory: ${hasilPrediksiBatch.length}`);

    // 5. High-Speed Bulk Insert Chunking (100 rows per SQL statement)
    const chunkSize = 100;
    for (let i = 0; i < dataCuacaBatch.length; i += chunkSize) {
      const cuacaChunk = dataCuacaBatch.slice(i, i + chunkSize);
      const predChunk = hasilPrediksiBatch.slice(i, i + chunkSize);

      // Bulk Insert data_cuaca
      const cuacaValues = [];
      const cuacaParams = [];
      let cIdx = 1;
      for (let r of cuacaChunk) {
        cuacaValues.push(`($${cIdx}, $${cIdx+1}, $${cIdx+2}, $${cIdx+3}, $${cIdx+4}, $${cIdx+5}, $${cIdx+6}, $${cIdx+7}, $${cIdx+8}, $${cIdx+9}, NOW())`);
        cuacaParams.push(r.id, r.lokasi_id, r.suhu, r.kelembapan, r.kecepatan_angin, r.curah_hujan, r.tekanan_udara, r.aktivitas_petir, r.waktu_pengamatan, r.created_by);
        cIdx += 10;
      }
      await client.query(`
        INSERT INTO data_cuaca (id, lokasi_id, suhu, kelembapan, kecepatan_angin, curah_hujan, tekanan_udara, aktivitas_petir, waktu_pengamatan, created_by, created_at)
        VALUES ${cuacaValues.join(', ')}
      `, cuacaParams);

      // Bulk Insert hasil_prediksi
      const predValues = [];
      const predParams = [];
      let pIdx = 1;
      for (let r of predChunk) {
        predValues.push(`($${pIdx}, $${pIdx+1}, $${pIdx+2}, $${pIdx+3}, $${pIdx+4}, $${pIdx+5}, $${pIdx+6}, $${pIdx+7})`);
        predParams.push(r.id, r.data_cuaca_id, r.lokasi_id, r.probabilitas, r.tingkat_risiko, r.warna_marker, r.rekomendasi, r.created_at);
        pIdx += 8;
      }
      await client.query(`
        INSERT INTO hasil_prediksi (id, data_cuaca_id, lokasi_id, probabilitas, tingkat_risiko, warna_marker, rekomendasi, created_at)
        VALUES ${predValues.join(', ')}
      `, predParams);
    }

    console.log(`[IMPORT] Bulk inserted data_cuaca: ${dataCuacaBatch.length}`);
    console.log(`[IMPORT] Bulk inserted hasil_prediksi: ${hasilPrediksiBatch.length}`);

    // Commit Transaksi
    await client.query('COMMIT');
    client.release();

    const durationMs = Date.now() - startTime;
    console.log(`[IMPORT] Completed successfully in: ${durationMs} ms`);

    const sampleResults = hasilPrediksiBatch.slice(0, 50).map((pred, idx) => ({
      hasil_prediksi_id: pred.id,
      nama_pos: uniqueSuccessRows[idx]?.namaPos || 'Stasiun BMKG',
      suhu: dataCuacaBatch[idx]?.suhu,
      curah_hujan: dataCuacaBatch[idx]?.curah_hujan,
      tekanan_udara: dataCuacaBatch[idx]?.tekanan_udara,
      kelembapan: dataCuacaBatch[idx]?.kelembapan,
      kecepatan_angin: dataCuacaBatch[idx]?.kecepatan_angin,
      tingkat_risiko: pred.tingkat_risiko,
      probabilitas: pred.probabilitas
    }));

    res.status(200).json({
      success: true,
      filename: req.body.filename || 'data_bmkg.csv',
      insertedCount: dataCuacaBatch.length,
      data: sampleResults,
      message: `Data BMKG berhasil diimport. Berhasil: ${dataCuacaBatch.length} data, Gagal: ${errorRows.length} data.`,
      summary: {
        totalCSV: lines.length - 1,
        successCount: dataCuacaBatch.length,
        errorCount: errorRows.length,
        insertedDataCuaca: dataCuacaBatch.length,
        insertedHasilPrediksi: hasilPrediksiBatch.length,
        detectedStations: Object.keys(lokasiMap),
        durationMs: durationMs,
        errors: errorRows
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    client.release();
    console.error('[IMPORT ERROR] Transaction rolled back:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gagal mengimpor data cuaca BMKG: ' + error.message,
      errorStage: 'PostgreSQL Bulk Transaction'
    });
  }
};

/**
 * Controller Rute GET /api/admin/ml-info
 * Mengembalikan seluruh informasi metodologi ML, parameter GNB 5-fitur, centroid K-Means,
 * serta hasil evaluasi data testing (Confusion Matrix, Akurasi, Presisi, Recall, F1-Score)
 */
const getMLPipelineInfo = async (req, res) => {
  try {
    const rawObservations = require('../config/bmkgObservations');
    const {
      preprocessBMKGData,
      runKMeansLabeling,
      stratifiedSplit,
      trainNaiveBayesModel,
      evaluateNaiveBayesModel
    } = require('../services/naiveBayes');

    const validDataset = [];
    let invalidCount = 0;

    for (let raw of rawObservations) {
      const prep = preprocessBMKGData(raw);
      if (prep.isValid) validDataset.push(prep.data);
      else invalidCount++;
    }

    const { labeledDataset, unnormCentroids, clusterScores, clusterToLabelMap, classCounts } = runKMeansLabeling(validDataset, 3);
    const { trainData, testData } = stratifiedSplit(labeledDataset, 0.8);
    const modelStats = trainNaiveBayesModel(trainData);
    const evaluation = evaluateNaiveBayesModel(modelStats, testData);

    // Get current DB training dataset count
    const dbTrainRes = await pool.query("SELECT COUNT(*) FROM dataset_training");
    const dbMainRes = await pool.query("SELECT COUNT(*) FROM data_cuaca");

    res.status(200).json({
      success: true,
      pipeline: {
        totalInitialObservations: rawObservations.length,
        invalidDataCount: invalidCount,
        mainDatasetCount: validDataset.length,
        trainingDataCount: trainData.length,
        testingDataCount: testData.length,
        clusterCount: 3,
        featureCount: 5,
        features: ['suhu', 'kelembapan', 'tekanan_udara', 'curah_hujan', 'kecepatan_angin'],
        classCounts,
        centroids: unnormCentroids.map((c, i) => ({
          clusterIndex: i,
          assignedLabel: clusterToLabelMap[i],
          values: c
        })),
        gnbParameters: modelStats,
        evaluation: {
          confusionMatrix: evaluation.matrix,
          accuracy: Number((evaluation.accuracy * 100).toFixed(2)),
          macroPrecision: Number((evaluation.macroPrecision * 100).toFixed(2)),
          macroRecall: Number((evaluation.macroRecall * 100).toFixed(2)),
          macroF1Score: Number((evaluation.macroF1 * 100).toFixed(2)),
          perClass: evaluation.perClass,
          totalTest: evaluation.totalTest,
          correctCount: evaluation.correctCount
        },
        dbStatus: {
          trainingTableRows: parseInt(dbTrainRes.rows[0].count, 10),
          dataCuacaTableRows: parseInt(dbMainRes.rows[0].count, 10)
        }
      }
    });
  } catch (error) {
    console.error('Error di getMLPipelineInfo:', error.message);
    res.status(500).json({ success: false, message: 'Gagal mengambil informasi ML pipeline: ' + error.message });
  }
};

module.exports = {
  getStatistik,
  getSemuaUser, deleteUser,
  getDataset, addDataset, deleteDataset,
  tambahEdukasi, hapusEdukasi,
  tambahLokasi, hapusLokasi,
  getSemuaPrediksi, hapusPrediksi, clearAllPrediksi,
  getSemuaNotifikasi, buatNotifikasi, hapusNotifikasi,
  getSystemSettings, updateSystemSettings,
  getSemuaLaporan, hapusLaporan,
  importCSVDataBMKG,
  getMLPipelineInfo
};


