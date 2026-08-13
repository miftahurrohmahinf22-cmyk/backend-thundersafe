const crypto = require('crypto');
const { pool } = require('../config/db');
const { predictNaiveBayes } = require('../services/naiveBayes');

// @desc    Hitung Prediksi Risiko dengan Naive Bayes & Simpan ke DB
// @route   POST /api/prediction
// @access  Private (Registered User Only)
const predictRisk = async (req, res) => {
  try {
    const userId = req.user.id;
    let { suhu, kelembapan, kecepatan_angin, curah_hujan, tekanan_udara, lokasi_id } = req.body;

    // Parse 4 Fitur Meteorologi Utama untuk Naive Bayes
    const suhuNum = parseFloat(suhu);
    const kelemNum = parseFloat(kelembapan);
    const anginNum = parseFloat(kecepatan_angin);
    const hujanNum = parseFloat(curah_hujan);
    const tekananNum = !isNaN(parseFloat(tekanan_udara)) ? parseFloat(tekanan_udara) : 1013.25;

    // Validasi input 4 fitur utama
    if (isNaN(suhuNum) || isNaN(kelemNum) || isNaN(anginNum) || isNaN(hujanNum)) {
      return res.status(400).json({
        success: false,
        message: 'Parameter meteorologi (suhu, kelembapan, kecepatan angin, curah hujan) harus berupa angka valid.'
      });
    }

    // Ambil default lokasi_id jika tidak dispesifikasikan
    if (!lokasi_id) {
      const defaultLokasiRes = await pool.query('SELECT id, nama_pos FROM lokasi LIMIT 1');
      if (defaultLokasiRes.rows.length > 0) {
        lokasi_id = defaultLokasiRes.rows[0].id;
      } else {
        return res.status(500).json({
          success: false,
          message: 'Data lokasi pemantauan belum tersedia di database. Silakan hubungi admin.'
        });
      }
    }

    // Ambil detail lokasi untuk detail notifikasi
    const lokasiRes = await pool.query('SELECT nama_pos FROM lokasi WHERE id = $1', [lokasi_id]);
    const namaPos = lokasiRes.rows.length > 0 ? lokasiRes.rows[0].nama_pos : 'Stasiun Cuaca';

    // 2. Jalankan Klasifikasi Gaussian Naive Bayes (4 Fitur)
    const predResult = await predictNaiveBayes(pool, {
      suhu: suhuNum,
      kelembapan: kelemNum,
      kecepatan_angin: anginNum,
      curah_hujan: hujanNum
    }, null, namaPos);

    const dataCuacaId = crypto.randomUUID();
    const hasilPrediksiId = crypto.randomUUID();
    const aktivitasPetir = predResult.riskLevel === 'Rendah' ? 0 : Math.floor(predResult.confidence * 1.2);

    // 3. Simpan ke data_cuaca
    await pool.query(
      `INSERT INTO data_cuaca (id, lokasi_id, suhu, kelembapan, kecepatan_angin, curah_hujan, tekanan_udara, aktivitas_petir, waktu_pengamatan, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, NOW())`,
      [dataCuacaId, lokasi_id, suhuNum, kelemNum, anginNum, hujanNum, tekananNum, aktivitasPetir, userId]
    );

    // 4. Simpan ke hasil_prediksi
    await pool.query(
      `INSERT INTO hasil_prediksi (id, data_cuaca_id, lokasi_id, probabilitas, tingkat_risiko, warna_marker, rekomendasi, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [hasilPrediksiId, dataCuacaId, lokasi_id, predResult.confidence, predResult.riskLevel, predResult.warna_marker, predResult.recommendation]
    );

    // 5. Tambah Notifikasi jika risiko Sedang atau Tinggi
    if (predResult.riskLevel !== 'Rendah') {
      const notifId = crypto.randomUUID();
      const judul = `Peringatan Risiko ${predResult.riskLevel}!`;
      const pesan = `Terdeteksi potensi sambaran petir ${predResult.confidence}% di area ${namaPos}. Rekomendasi: ${predResult.recommendation}`;
      
      await pool.query(
        `INSERT INTO notifikasi (id, user_id, hasil_prediksi_id, judul, pesan, status_baca, created_at)
         VALUES ($1, $2, $3, $4, $5, false, NOW())`,
        [notifId, userId, hasilPrediksiId, judul, pesan]
      );
    }

    res.status(200).json({
      success: true,
      message: 'Prediksi berhasil dihitung dan disimpan.',
      result: {
        id: hasilPrediksiId,
        suhu: suhuNum,
        kelembapan: kelemNum,
        kecepatan_angin: anginNum,
        curah_hujan: hujanNum,
        tekanan_udara: tekananNum,
        aktivitas_petir: aktivitasPetir,
        riskLevel: predResult.riskLevel,
        confidence: predResult.confidence,
        recommendation: predResult.recommendation,
        warna_marker: predResult.warna_marker,
        lokasi: namaPos,
        created_at: new Date()
      }
    });

  } catch (error) {
    console.error('Error di prediksiController:', error.message);
    res.status(500).json({
      success: false,
      message: 'Gagal memproses prediksi cuaca.'
    });
  }
};

module.exports = {
  predictRisk
};
