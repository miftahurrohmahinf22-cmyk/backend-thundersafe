const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { predictNaiveBayes } = require('../services/naiveBayes');

async function seedDatabase(pool) {
  try {
    console.log("Memulai pemeriksaan database seeder...");

    // 1. Seed Lokasi
    const lokasiCountRes = await pool.query("SELECT COUNT(*) FROM lokasi");
    const lokasiCount = parseInt(lokasiCountRes.rows[0].count, 10);
    
    let locations = [];
    if (lokasiCount === 0) {
      console.log("Tabel lokasi kosong. Memulai seeding lokasi...");
      const locationsData = [
        { nama_pos: 'Pos Sleman Kota', kawasan: 'Pusat Kota', desa: 'Triadi', kecamatan: 'Sleman', kabupaten: 'Sleman', lat: -7.7156, lon: 110.3556 },
        { nama_pos: 'Pos Kaliurang', kawasan: 'Lereng Gunung', desa: 'Hargobinangun', kecamatan: 'Pakem', kabupaten: 'Sleman', lat: -7.5956, lon: 110.4256 },
        { nama_pos: 'Pos Babarsari', kawasan: 'Kawasan Pendidikan/Bisnis', desa: 'Caturtunggal', kecamatan: 'Depok', kabupaten: 'Sleman', lat: -7.7794, lon: 110.4156 },
        { nama_pos: 'Pos Malioboro', kawasan: 'Kawasan Wisata', desa: 'Sosromenduran', kecamatan: 'Gedongtengen', kabupaten: 'Yogyakarta', lat: -7.7926, lon: 110.3658 },
        { nama_pos: 'Pos Bantul Kota', kawasan: 'Dataran Rendah', desa: 'Bantul', kecamatan: 'Bantul', kabupaten: 'Bantul', lat: -7.8878, lon: 110.3278 },
        { nama_pos: 'Pos Kulon Progo', kawasan: 'Kawasan Pesisir', desa: 'Wates', kecamatan: 'Wates', kabupaten: 'Kulon Progo', lat: -7.8600, lon: 110.1500 }
      ];

      for (let loc of locationsData) {
        const id = crypto.randomUUID();
        await pool.query(
          `INSERT INTO lokasi (id, nama_pos, kawasan, desa, kecamatan, kabupaten, latitude, longtitude, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
          [id, loc.nama_pos, loc.kawasan, loc.desa, loc.kecamatan, loc.kabupaten, loc.lat, loc.lon]
        );
        locations.push({ id, ...loc });
      }
      console.log(`Berhasil seeding ${locationsData.length} lokasi.`);
    } else {
      console.log(`Tabel lokasi sudah memiliki ${lokasiCount} data. Seeding dilewati.`);
      const res = await pool.query("SELECT * FROM lokasi");
      locations = res.rows.map(r => ({
        id: r.id,
        nama_pos: r.nama_pos,
        kawasan: r.kawasan,
        desa: r.desa,
        kecamatan: r.kecamatan,
        kabupaten: r.kabupaten,
        lat: parseFloat(r.latitude),
        lon: parseFloat(r.longtitude)
      }));
    }

    // 2. Seed Dataset Training (untuk Naive Bayes)
    const datasetCountRes = await pool.query("SELECT COUNT(*) FROM dataset_training");
    const datasetCount = parseInt(datasetCountRes.rows[0].count, 10);

    if (datasetCount === 0) {
      console.log("Tabel dataset_training kosong. Memulai seeding dataset_training...");
      const dataset = [
        { suhu: 26.7, curah_hujan: 1.3, tekanan_udara: 995.8, kelembapan: 88.2, kecepatan_angin: 8.4, kelas_risiko: 'Sedang' },
        { suhu: 26.1, curah_hujan: 111.6, tekanan_udara: 995.8, kelembapan: 81.5, kecepatan_angin: 7.1, kelas_risiko: 'Tinggi' },
        { suhu: 26.6, curah_hujan: 0.0, tekanan_udara: 996.2, kelembapan: 86.8, kecepatan_angin: 7.1, kelas_risiko: 'Rendah' },
        { suhu: 26.6, curah_hujan: 24.3, tekanan_udara: 996.8, kelembapan: 88.5, kecepatan_angin: 7.6, kelas_risiko: 'Tinggi' },
        { suhu: 26.7, curah_hujan: 0.2, tekanan_udara: 995.5, kelembapan: 85.5, kecepatan_angin: 6.4, kelas_risiko: 'Rendah' },
        { suhu: 28.1, curah_hujan: 0.0, tekanan_udara: 997.2, kelembapan: 77.2, kecepatan_angin: 6.7, kelas_risiko: 'Rendah' },
        { suhu: 27.2, curah_hujan: 4.2, tekanan_udara: 995.3, kelembapan: 83.5, kecepatan_angin: 9.0, kelas_risiko: 'Rendah' },
        { suhu: 27.7, curah_hujan: 0.0, tekanan_udara: 996.7, kelembapan: 82.5, kecepatan_angin: 10.5, kelas_risiko: 'Rendah' },
        { suhu: 25.9, curah_hujan: 0.1, tekanan_udara: 995.1, kelembapan: 91.0, kecepatan_angin: 8.0, kelas_risiko: 'Tinggi' },
        { suhu: 26.0, curah_hujan: 14.1, tekanan_udara: 995.4, kelembapan: 88.8, kecepatan_angin: 9.0, kelas_risiko: 'Tinggi' },
        { suhu: 25.4, curah_hujan: 8.0, tekanan_udara: 996.9, kelembapan: 89.0, kecepatan_angin: 7.4, kelas_risiko: 'Tinggi' },
        { suhu: 25.2, curah_hujan: 39.3, tekanan_udara: 996.4, kelembapan: 90.2, kecepatan_angin: 9.1, kelas_risiko: 'Tinggi' },
        { suhu: 25.2, curah_hujan: 18.2, tekanan_udara: 996.4, kelembapan: 91.0, kecepatan_angin: 8.3, kelas_risiko: 'Tinggi' },
        { suhu: 26.0, curah_hujan: 28.4, tekanan_udara: 995.7, kelembapan: 86.2, kecepatan_angin: 10.1, kelas_risiko: 'Tinggi' },
        { suhu: 26.2, curah_hujan: 13.9, tekanan_udara: 995.6, kelembapan: 86.8, kecepatan_angin: 7.1, kelas_risiko: 'Tinggi' },
        { suhu: 27.0, curah_hujan: 6.3, tekanan_udara: 992.9, kelembapan: 82.8, kecepatan_angin: 10.3, kelas_risiko: 'Sedang' },
        { suhu: 26.2, curah_hujan: 35.0, tekanan_udara: 993.3, kelembapan: 89.8, kecepatan_angin: 11.0, kelas_risiko: 'Sedang' },
        { suhu: 25.2, curah_hujan: 43.1, tekanan_udara: 993.0, kelembapan: 94.2, kecepatan_angin: 4.8, kelas_risiko: 'Tinggi' },
        { suhu: 26.5, curah_hujan: 1.7, tekanan_udara: 993.1, kelembapan: 84.8, kecepatan_angin: 7.1, kelas_risiko: 'Sedang' },
        { suhu: 26.5, curah_hujan: 19.2, tekanan_udara: 993.1, kelembapan: 87.8, kecepatan_angin: 8.4, kelas_risiko: 'Sedang' },
        { suhu: 26.1, curah_hujan: 8.3, tekanan_udara: 994.6, kelembapan: 86.2, kecepatan_angin: 8.3, kelas_risiko: 'Sedang' },
        { suhu: 27.1, curah_hujan: 0.0, tekanan_udara: 993.0, kelembapan: 84.2, kecepatan_angin: 4.4, kelas_risiko: 'Sedang' },
        { suhu: 28.2, curah_hujan: 4.2, tekanan_udara: 996.2, kelembapan: 68.0, kecepatan_angin: 17.2, kelas_risiko: 'Rendah' },
        { suhu: 26.7, curah_hujan: 0.0, tekanan_udara: 996.8, kelembapan: 83.2, kecepatan_angin: 8.0, kelas_risiko: 'Rendah' },
        { suhu: 26.8, curah_hujan: 0.0, tekanan_udara: 997.5, kelembapan: 85.2, kecepatan_angin: 6.4, kelas_risiko: 'Rendah' },
        { suhu: 26.2, curah_hujan: 19.0, tekanan_udara: 997.6, kelembapan: 90.0, kecepatan_angin: 5.8, kelas_risiko: 'Tinggi' },
        { suhu: 25.3, curah_hujan: 13.6, tekanan_udara: 997.0, kelembapan: 94.2, kecepatan_angin: 6.3, kelas_risiko: 'Tinggi' },
        { suhu: 25.9, curah_hujan: 10.7, tekanan_udara: 997.2, kelembapan: 88.8, kecepatan_angin: 4.8, kelas_risiko: 'Tinggi' },
        { suhu: 25.4, curah_hujan: 10.2, tekanan_udara: 997.1, kelembapan: 91.5, kecepatan_angin: 5.1, kelas_risiko: 'Tinggi' },
        { suhu: 26.7, curah_hujan: 37.4, tekanan_udara: 998.6, kelembapan: 86.5, kecepatan_angin: 11.0, kelas_risiko: 'Rendah' },
        { suhu: 25.0, curah_hujan: 6.5, tekanan_udara: 997.9, kelembapan: 94.5, kecepatan_angin: 4.4, kelas_risiko: 'Tinggi' },
        { suhu: 26.3, curah_hujan: 26.4, tekanan_udara: 997.0, kelembapan: 88.0, kecepatan_angin: 7.7, kelas_risiko: 'Tinggi' },
        { suhu: 26.8, curah_hujan: 1.0, tekanan_udara: 996.5, kelembapan: 84.8, kecepatan_angin: 10.3, kelas_risiko: 'Rendah' },
        { suhu: 26.6, curah_hujan: 19.5, tekanan_udara: 997.9, kelembapan: 87.0, kecepatan_angin: 8.5, kelas_risiko: 'Rendah' },
        { suhu: 26.8, curah_hujan: 0.1, tekanan_udara: 996.8, kelembapan: 85.2, kecepatan_angin: 8.7, kelas_risiko: 'Rendah' },
        { suhu: 26.7, curah_hujan: 4.0, tekanan_udara: 997.1, kelembapan: 87.0, kecepatan_angin: 7.7, kelas_risiko: 'Rendah' },
        { suhu: 26.9, curah_hujan: 1.3, tekanan_udara: 996.0, kelembapan: 87.5, kecepatan_angin: 10.1, kelas_risiko: 'Rendah' },
        { suhu: 26.8, curah_hujan: 0.4, tekanan_udara: 995.6, kelembapan: 85.8, kecepatan_angin: 5.8, kelas_risiko: 'Rendah' },
        { suhu: 25.8, curah_hujan: 0.0, tekanan_udara: 994.8, kelembapan: 94.5, kecepatan_angin: 3.0, kelas_risiko: 'Tinggi' },
        { suhu: 26.0, curah_hujan: 28.6, tekanan_udara: 997.3, kelembapan: 89.2, kecepatan_angin: 5.6, kelas_risiko: 'Tinggi' },
        { suhu: 26.8, curah_hujan: 0.5, tekanan_udara: 994.8, kelembapan: 86.8, kecepatan_angin: 8.2, kelas_risiko: 'Rendah' },
        { suhu: 27.2, curah_hujan: 0.0, tekanan_udara: 994.6, kelembapan: 81.2, kecepatan_angin: 10.5, kelas_risiko: 'Rendah' },
        { suhu: 25.9, curah_hujan: 59.0, tekanan_udara: 995.7, kelembapan: 88.8, kecepatan_angin: 7.6, kelas_risiko: 'Tinggi' },
        { suhu: 26.9, curah_hujan: 5.7, tekanan_udara: 995.5, kelembapan: 85.8, kecepatan_angin: 7.7, kelas_risiko: 'Rendah' },
        { suhu: 26.4, curah_hujan: 15.6, tekanan_udara: 994.6, kelembapan: 88.5, kecepatan_angin: 5.1, kelas_risiko: 'Tinggi' },
        { suhu: 25.9, curah_hujan: 110.0, tekanan_udara: 992.4, kelembapan: 90.2, kecepatan_angin: 6.8, kelas_risiko: 'Tinggi' },
        { suhu: 27.1, curah_hujan: 8.3, tekanan_udara: 992.7, kelembapan: 87.8, kecepatan_angin: 4.4, kelas_risiko: 'Sedang' },
        { suhu: 24.8, curah_hujan: 0.5, tekanan_udara: 994.0, kelembapan: 94.5, kecepatan_angin: 8.8, kelas_risiko: 'Tinggi' },
        { suhu: 26.2, curah_hujan: 72.6, tekanan_udara: 995.0, kelembapan: 88.0, kecepatan_angin: 5.8, kelas_risiko: 'Tinggi' },
        { suhu: 25.1, curah_hujan: 22.1, tekanan_udara: 996.0, kelembapan: 95.2, kecepatan_angin: 4.3, kelas_risiko: 'Tinggi' },
        { suhu: 26.7, curah_hujan: 38.0, tekanan_udara: 993.3, kelembapan: 87.2, kecepatan_angin: 6.1, kelas_risiko: 'Sedang' },
        { suhu: 26.2, curah_hujan: 29.0, tekanan_udara: 992.7, kelembapan: 87.5, kecepatan_angin: 8.1, kelas_risiko: 'Sedang' },
        { suhu: 25.8, curah_hujan: 4.0, tekanan_udara: 994.3, kelembapan: 89.0, kecepatan_angin: 8.4, kelas_risiko: 'Sedang' },
        { suhu: 25.2, curah_hujan: 68.0, tekanan_udara: 995.7, kelembapan: 91.8, kecepatan_angin: 8.1, kelas_risiko: 'Tinggi' },
        { suhu: 25.9, curah_hujan: 16.0, tekanan_udara: 992.3, kelembapan: 89.0, kecepatan_angin: 9.4, kelas_risiko: 'Sedang' },
        { suhu: 24.1, curah_hujan: 25.5, tekanan_udara: 992.4, kelembapan: 96.8, kecepatan_angin: 3.7, kelas_risiko: 'Tinggi' },
        { suhu: 26.0, curah_hujan: 40.6, tekanan_udara: 993.1, kelembapan: 90.0, kecepatan_angin: 5.7, kelas_risiko: 'Tinggi' },
        { suhu: 25.9, curah_hujan: 26.0, tekanan_udara: 992.1, kelembapan: 87.5, kecepatan_angin: 9.8, kelas_risiko: 'Sedang' },
        { suhu: 25.7, curah_hujan: 18.6, tekanan_udara: 994.7, kelembapan: 91.5, kecepatan_angin: 5.1, kelas_risiko: 'Tinggi' },
        { suhu: 26.4, curah_hujan: 14.1, tekanan_udara: 993.9, kelembapan: 86.5, kecepatan_angin: 7.4, kelas_risiko: 'Sedang' },
        { suhu: 26.1, curah_hujan: 12.8, tekanan_udara: 993.6, kelembapan: 87.8, kecepatan_angin: 8.3, kelas_risiko: 'Sedang' },
        { suhu: 26.4, curah_hujan: 8.0, tekanan_udara: 994.0, kelembapan: 87.2, kecepatan_angin: 12.4, kelas_risiko: 'Sedang' },
        { suhu: 26.8, curah_hujan: 1.2, tekanan_udara: 992.4, kelembapan: 82.8, kecepatan_angin: 14.0, kelas_risiko: 'Sedang' },
        { suhu: 26.1, curah_hujan: 0.1, tekanan_udara: 993.2, kelembapan: 85.5, kecepatan_angin: 10.3, kelas_risiko: 'Sedang' },
        { suhu: 25.8, curah_hujan: 18.5, tekanan_udara: 995.2, kelembapan: 88.5, kecepatan_angin: 8.3, kelas_risiko: 'Tinggi' },
        { suhu: 26.9, curah_hujan: 2.5, tekanan_udara: 996.4, kelembapan: 84.8, kecepatan_angin: 6.7, kelas_risiko: 'Rendah' },
        { suhu: 27.2, curah_hujan: 0.0, tekanan_udara: 995.8, kelembapan: 82.2, kecepatan_angin: 10.1, kelas_risiko: 'Rendah' },
        { suhu: 26.9, curah_hujan: 0.0, tekanan_udara: 996.4, kelembapan: 84.5, kecepatan_angin: 9.4, kelas_risiko: 'Rendah' },
        { suhu: 27.4, curah_hujan: 0.4, tekanan_udara: 991.8, kelembapan: 78.0, kecepatan_angin: 12.5, kelas_risiko: 'Rendah' },
        { suhu: 27.0, curah_hujan: 0.0, tekanan_udara: 996.0, kelembapan: 76.0, kecepatan_angin: 13.4, kelas_risiko: 'Rendah' },
        { suhu: 26.7, curah_hujan: 0.0, tekanan_udara: 996.4, kelembapan: 81.8, kecepatan_angin: 9.5, kelas_risiko: 'Rendah' },
        { suhu: 26.5, curah_hujan: 0.0, tekanan_udara: 996.4, kelembapan: 85.5, kecepatan_angin: 9.1, kelas_risiko: 'Rendah' },
        { suhu: 26.6, curah_hujan: 0.0, tekanan_udara: 996.3, kelembapan: 85.2, kecepatan_angin: 9.4, kelas_risiko: 'Rendah' },
        { suhu: 27.1, curah_hujan: 3.0, tekanan_udara: 997.9, kelembapan: 82.8, kecepatan_angin: 13.2, kelas_risiko: 'Rendah' },
        { suhu: 27.3, curah_hujan: 0.0, tekanan_udara: 997.9, kelembapan: 82.2, kecepatan_angin: 8.5, kelas_risiko: 'Rendah' },
        { suhu: 26.9, curah_hujan: 0.0, tekanan_udara: 994.7, kelembapan: 80.8, kecepatan_angin: 7.7, kelas_risiko: 'Rendah' },
        { suhu: 27.2, curah_hujan: 0.0, tekanan_udara: 996.6, kelembapan: 81.0, kecepatan_angin: 8.3, kelas_risiko: 'Rendah' },
        { suhu: 27.5, curah_hujan: 0.0, tekanan_udara: 996.8, kelembapan: 81.0, kecepatan_angin: 7.3, kelas_risiko: 'Rendah' },
        { suhu: 27.8, curah_hujan: 0.0, tekanan_udara: 996.4, kelembapan: 84.8, kecepatan_angin: 8.0, kelas_risiko: 'Rendah' },
        { suhu: 27.0, curah_hujan: 0.0, tekanan_udara: 996.8, kelembapan: 81.8, kecepatan_angin: 5.8, kelas_risiko: 'Rendah' },
        { suhu: 26.4, curah_hujan: 1.0, tekanan_udara: 994.1, kelembapan: 85.2, kecepatan_angin: 8.8, kelas_risiko: 'Sedang' },
        { suhu: 27.8, curah_hujan: 0.0, tekanan_udara: 994.1, kelembapan: 81.8, kecepatan_angin: 10.4, kelas_risiko: 'Rendah' },
        { suhu: 26.6, curah_hujan: 23.7, tekanan_udara: 994.3, kelembapan: 88.0, kecepatan_angin: 6.3, kelas_risiko: 'Sedang' },
        { suhu: 26.5, curah_hujan: 22.5, tekanan_udara: 994.9, kelembapan: 81.8, kecepatan_angin: 4.1, kelas_risiko: 'Sedang' },
        { suhu: 25.9, curah_hujan: 20.7, tekanan_udara: 995.2, kelembapan: 93.5, kecepatan_angin: 6.1, kelas_risiko: 'Tinggi' },
        { suhu: 27.2, curah_hujan: 0.0, tekanan_udara: 996.5, kelembapan: 87.2, kecepatan_angin: 7.3, kelas_risiko: 'Rendah' },
        { suhu: 27.4, curah_hujan: 0.0, tekanan_udara: 995.1, kelembapan: 83.5, kecepatan_angin: 9.3, kelas_risiko: 'Rendah' },
        { suhu: 25.8, curah_hujan: 0.9, tekanan_udara: 996.1, kelembapan: 94.5, kecepatan_angin: 3.7, kelas_risiko: 'Tinggi' },
        { suhu: 26.1, curah_hujan: 24.6, tekanan_udara: 996.9, kelembapan: 88.8, kecepatan_angin: 5.7, kelas_risiko: 'Tinggi' },
        { suhu: 26.0, curah_hujan: 13.2, tekanan_udara: 995.1, kelembapan: 90.2, kecepatan_angin: 4.7, kelas_risiko: 'Tinggi' },
        { suhu: 26.5, curah_hujan: 10.3, tekanan_udara: 995.6, kelembapan: 86.0, kecepatan_angin: 5.7, kelas_risiko: 'Rendah' },
        { suhu: 26.9, curah_hujan: 31.8, tekanan_udara: 996.7, kelembapan: 88.5, kecepatan_angin: 6.1, kelas_risiko: 'Tinggi' },
        { suhu: 27.0, curah_hujan: 0.0, tekanan_udara: 996.0, kelembapan: 88.5, kecepatan_angin: 3.8, kelas_risiko: 'Rendah' },
        { suhu: 26.9, curah_hujan: 23.8, tekanan_udara: 996.5, kelembapan: 89.2, kecepatan_angin: 3.8, kelas_risiko: 'Tinggi' },
        { suhu: 26.9, curah_hujan: 0.3, tekanan_udara: 997.5, kelembapan: 87.5, kecepatan_angin: 7.8, kelas_risiko: 'Rendah' },
        { suhu: 26.1, curah_hujan: 51.0, tekanan_udara: 997.0, kelembapan: 90.0, kecepatan_angin: 7.3, kelas_risiko: 'Tinggi' },
        { suhu: 26.4, curah_hujan: 14.3, tekanan_udara: 998.0, kelembapan: 88.0, kecepatan_angin: 8.3, kelas_risiko: 'Rendah' },
        { suhu: 26.9, curah_hujan: 10.7, tekanan_udara: 997.4, kelembapan: 85.0, kecepatan_angin: 8.4, kelas_risiko: 'Rendah' },
        { suhu: 27.6, curah_hujan: 9.5, tekanan_udara: 997.5, kelembapan: 82.8, kecepatan_angin: 3.6, kelas_risiko: 'Rendah' },
        { suhu: 27.8, curah_hujan: 0.0, tekanan_udara: 995.2, kelembapan: 84.2, kecepatan_angin: 5.4, kelas_risiko: 'Rendah' },
        { suhu: 26.4, curah_hujan: 11.0, tekanan_udara: 996.3, kelembapan: 88.5, kecepatan_angin: 5.6, kelas_risiko: 'Tinggi' },
        { suhu: 28.1, curah_hujan: 0.0, tekanan_udara: 996.3, kelembapan: 83.0, kecepatan_angin: 8.0, kelas_risiko: 'Rendah' },
        { suhu: 27.5, curah_hujan: 0.0, tekanan_udara: 996.1, kelembapan: 83.8, kecepatan_angin: 6.7, kelas_risiko: 'Rendah' },
        { suhu: 27.4, curah_hujan: 0.0, tekanan_udara: 996.9, kelembapan: 83.0, kecepatan_angin: 7.6, kelas_risiko: 'Rendah' },
        { suhu: 27.6, curah_hujan: 0.0, tekanan_udara: 993.5, kelembapan: 82.5, kecepatan_angin: 9.1, kelas_risiko: 'Sedang' },
        { suhu: 27.8, curah_hujan: 0.0, tekanan_udara: 997.2, kelembapan: 84.8, kecepatan_angin: 7.1, kelas_risiko: 'Rendah' },
        { suhu: 27.5, curah_hujan: 0.9, tekanan_udara: 995.2, kelembapan: 83.5, kecepatan_angin: 8.7, kelas_risiko: 'Rendah' },
        { suhu: 28.6, curah_hujan: 0.0, tekanan_udara: 994.4, kelembapan: 79.2, kecepatan_angin: 8.8, kelas_risiko: 'Rendah' },
        { suhu: 28.1, curah_hujan: 0.8, tekanan_udara: 994.1, kelembapan: 80.8, kecepatan_angin: 5.8, kelas_risiko: 'Rendah' },
        { suhu: 27.2, curah_hujan: 0.0, tekanan_udara: 995.2, kelembapan: 87.2, kecepatan_angin: 8.7, kelas_risiko: 'Rendah' },
        { suhu: 27.8, curah_hujan: 0.0, tekanan_udara: 993.4, kelembapan: 84.8, kecepatan_angin: 5.7, kelas_risiko: 'Rendah' },
        { suhu: 27.9, curah_hujan: 0.0, tekanan_udara: 993.4, kelembapan: 86.5, kecepatan_angin: 6.6, kelas_risiko: 'Sedang' },
        { suhu: 27.8, curah_hujan: 8.6, tekanan_udara: 996.3, kelembapan: 85.2, kecepatan_angin: 6.0, kelas_risiko: 'Rendah' },
        { suhu: 26.5, curah_hujan: 31.6, tekanan_udara: 996.2, kelembapan: 91.8, kecepatan_angin: 5.0, kelas_risiko: 'Tinggi' }
      ];

      for (let d of dataset) {
        const petir = d.kelas_risiko === 'Tinggi' ? Math.floor(Math.random() * 15 + 10) : (d.kelas_risiko === 'Sedang' ? Math.floor(Math.random() * 8 + 2) : 0);
        await pool.query(
          `INSERT INTO dataset_training (id, suhu, kelembapan, kecepatan_angin, curah_hujan, tekanan_udara, aktivitas_petir, kelas_risiko)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [crypto.randomUUID(), d.suhu, d.kelembapan, d.kecepatan_angin, d.curah_hujan, d.tekanan_udara, petir, d.kelas_risiko]
        );
      }
      console.log(`Berhasil seeding ${dataset.length} data latih Naive Bayes.`);
    } else {
      console.log(`Tabel dataset_training sudah memiliki ${datasetCount} data. Seeding dilewati.`);
    }

    // 3. Seed Edukasi (Unconditional Truncate & Update to cover 12 topics)
    console.log("Memperbarui artikel edukasi di database...");
    await pool.query("DELETE FROM edukasi");
    
    const articles = [
      {
        judul: 'Sains Kebencanaan: Definisi Petir, Penyebab Terbentuknya, Dampak Sambaran, dan Cara Menghindari Bahaya',
        isi: `Petir adalah sebuah fenomena pelepasan muatan listrik statis yang terjadi di atmosfer secara mendadak. Pelepasan muatan ini biasanya disertai dengan kilatan cahaya yang menyilaukan dan suara gemuruh yang dahsyat yang disebut guruh atau guntur.

Penyebab terjadinya petir didorong oleh adanya perbedaan potensial listrik yang sangat besar antara awan badai (terutama awan Cumulonimbus) dengan tanah (bumi), atau antarmuatan di dalam awan itu sendiri. Selama badai terjadi, partikel es di dalam awan saling bertabrakan, menciptakan pemisahan muatan positif di bagian atas awan dan muatan negatif di bagian bawah awan. Ketika perbedaan potensial antara muatan negatif di dasar awan dengan muatan positif di permukaan tanah melebihi daya isolasi udara, terjadilah pelepasan muatan listrik secara mendadak yang kita kenal sebagai petir.

Dampak sambaran petir sangat merusak dan fatal. Secara fisiologis pada manusia, sambaran petir dapat menyebabkan henti jantung (cardiac arrest), kerusakan sistem saraf pusat, luka bakar tingkat tiga, gangguan pendengaran akibat suara gemuruh, hingga kematian seketika. Secara struktural, petir dapat menghancurkan atap bangunan, merobohkan tiang utilitas, memicu kebakaran hebat pada area hutan atau pemukiman, dan melelehkan instalasi listrik. Selain itu, lonjakan listrik (surge) akibat sambaran petir dapat menjalar melalui jaringan kabel listrik dan merusak seluruh peralatan rumah tangga.

Cara menghindari petir yang paling mendasar adalah memantau prakiraan cuaca secara aktif melalui platform mitigasi terpercaya seperti ThunderSafe dan segera mengevakuasi diri ke tempat aman saat awan mendung gelap Cumulonimbus mulai terbentuk. Prinsip utamanya adalah menjauhi tempat terbuka dan objek tinggi yang rentan menjadi jalur sambaran.`,
        gambar: 'https://images.unsplash.com/photo-1461511601199-8006b2379e15?auto=format&fit=crop&w=600&q=80'
      },
      {
        judul: 'Prosedur Evakuasi dan Panduan Keselamatan Petir di Rumah, Kendaraan, Luar Ruangan, serta Lapangan Kerja',
        isi: `Keselamatan saat badai petir sangat bergantung pada pemahaman kita mengenai prosedur evakuasi dan perilaku aman di berbagai lingkungan berbeda.

Keselamatan di Rumah: Ketika berada di dalam rumah saat terjadi badai petir, hindari menyentuh benda-benda logam, kabel listrik, atau pipa air. Air dan logam merupakan konduktor listrik yang sangat baik. Jauhi jendela, pintu kaca, dan teras rumah. Sangat disarankan untuk mematikan dan mencabut stopkontak seluruh peralatan elektronik sensitif agar aman dari lonjakan tegangan.

Keselamatan di Kendaraan: Mobil atau kendaraan beratap logam tertutup rapat merupakan salah satu tempat berlindung yang sangat aman dari petir. Hal ini disebabkan oleh prinsip sangkar Faraday, di mana muatan listrik petir akan merambat di permukaan logam kendaraan dan mengalir ke tanah tanpa membahayakan penumpang di dalamnya. Namun, pastikan jendela ditutup rapat dan hindari menyentuh bagian logam interior mobil. Kendaraan beroda dua seperti sepeda motor atau sepeda sangat tidak aman dan harus segera ditinggalkan untuk mencari gedung kokoh terdekat.

Keselamatan di Luar Ruangan: Jika Anda terjebak di luar ruangan tanpa bangunan di sekitar, jauhi lapangan terbuka, sawah, kolam renang, pantai, dan lapangan olahraga. Hindari berdiri di dekat tiang listrik, menara pemancar, atau di bawah pohon yang tinggi. Jika tidak ada bangunan terdekat, lakukan posisi jongkok petir: rapatkan kedua kaki Anda, tundukkan kepala serendah mungkin mendekati lutut, dan tutup telinga dengan tangan untuk meminimalkan paparan muatan di tanah.

Keselamatan Pekerja Lapangan: Para pekerja lapangan (seperti petani di sawah, pekerja konstruksi, atau teknisi jaringan) memiliki risiko paling tinggi. Manajemen proyek atau pengawas wajib menghentikan aktivitas kerja luar ruangan saat badai petir mulai terdeteksi. Gunakan sirine atau sistem notifikasi ThunderSafe untuk memulai evakuasi terstruktur menuju stasiun atau shelter terdekat.

Prosedur Evakuasi: Ikuti langkah 30-30. Jika Anda melihat kilatan petir dan mendengar guntur dalam waktu kurang dari 30 detik, segera evakuasi ke bangunan kokoh terdekat. Tetaplah berada di dalam tempat perlindungan hingga 30 menit setelah suara guntur terakhir terdengar.`,
        gambar: 'https://images.unsplash.com/photo-1534088568595-a066f410bcda?auto=format&fit=crop&w=600&q=80'
      },
      {
        judul: 'Langkah Taktis Menghadapi Badai Petir: Tindakan Sebelum, Saat, dan Setelah Badai serta Proteksi Peralatan Elektronik',
        isi: `Mengantisipasi badai petir membutuhkan kesiapan taktis sebelum badai datang, tindakan darurat saat terjadi badai, hingga langkah pemulihan setelah badai berlalu.

Langkah Sebelum Badai: Selalu pantau radar risiko petir di aplikasi ThunderSafe. Jika sistem mendeteksi kenaikan kelembapan dan aktivitas petir di stasiun pemantauan terdekat Anda, segeralah pulang ke rumah atau masuk ke dalam gedung permanen. Amankan barang-barang luar ruangan yang mudah terbakar.

Langkah Saat Badai: Tetaplah berada di dalam ruangan. Jangan mandi, mencuci piring, atau menggunakan air keran karena pipa besi atau air dapat menyalurkan listrik dari sambaran petir di luar. Hindari menggunakan telepon kabel rumah (landline) karena kabel fisik luar ruangan dapat menghantarkan petir langsung ke telinga Anda. Telepon seluler aman digunakan karena tidak tersambung ke jaringan kabel fisik.

Langkah Setelah Badai: Jangan langsung keluar ruangan begitu hujan mereda. Tunggu minimal 30 menit setelah suara guntur terakhir terdengar. Jika ada korban tersambar petir di sekitar Anda, segera hubungi layanan darurat. Korban sambaran petir tidak menyimpan muatan listrik, sehingga aman untuk disentuh dan diberikan pertolongan pertama berupa CPR (RJP) jika mereka mengalami henti nafas dan henti jantung.

Perlindungan Perangkat Elektronik: Sambaran petir tidak langsung dapat merusak perangkat digital rumah tangga melalui kabel utilitas listrik yang membentang di luar. Untuk memberikan proteksi maksimal, pasanglah perangkat Surge Arrester berkualitas di panel listrik utama rumah. Selain itu, cabutlah kabel daya TV, komputer, dan router modem internet dari stopkontak dinding saat badai petir mulai terjadi untuk memutus koneksi fisik secara total dari lonjakan tegangan luar ruangan.`,
        gambar: 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?auto=format&fit=crop&w=600&q=80'
      }
    ];

    for (let art of articles) {
      await pool.query(
        `INSERT INTO edukasi (id, judul, isi, gambar, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [crypto.randomUUID(), art.judul, art.isi, art.gambar]
      );
    }
    console.log(`Berhasil seeding ${articles.length} artikel edukasi baru.`);

    // 4. Seed Default Admin User
    const adminExistRes = await pool.query('SELECT id FROM "User" WHERE role = $1 LIMIT 1', ['admin']);
    let adminId = adminExistRes.rows.length > 0 ? adminExistRes.rows[0].id : null;
    
    if (!adminId) {
      console.log("Admin belum ada. Memulai pembuatan default Admin...");
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('admin123', salt);
      const defaultPhoto = '';
      adminId = crypto.randomUUID();
      
      await pool.query(
        `INSERT INTO "User" (id, nama, email, password, "photo profile", role, create_at, update_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
        [adminId, 'Administrator', 'admin@thundersafe.com', hashedPassword, defaultPhoto, 'admin']
      );
      console.log("Berhasil membuat default Admin: admin@thundersafe.com (password: admin123)");
    } else {
      console.log("Akun Admin sudah tersedia.");
    }

    // 6. Seed Data Cuaca Dummy & Hasil Prediksi (untuk simulasi grafik dan tabel awal)
    const cuacaCountRes = await pool.query("SELECT COUNT(*) FROM data_cuaca");
    const cuacaCount = parseInt(cuacaCountRes.rows[0].count, 10);

    if (cuacaCount === 0) {
      console.log("Tabel data_cuaca kosong. Menambahkan data cuaca dummy dan hasil prediksi...");
      const hoursOffsets = [48, 24, 12, 6, 2, 0]; // Berbagai offset jam ke belakang

      for (let loc of locations) {
        for (let offset of hoursOffsets) {
          const dataCuacaId = crypto.randomUUID();
          const hasilPrediksiId = crypto.randomUUID();
          
          // Parameter acak representatif
          const rand = Math.random();
          let tempInput = {};
          if (rand < 0.4) {
            tempInput = { suhu: parseFloat((28 + Math.random() * 5).toFixed(1)), kelembapan: parseFloat((50 + Math.random() * 20).toFixed(1)), kecepatan_angin: parseFloat((2 + Math.random() * 8).toFixed(1)), curah_hujan: parseFloat((Math.random() * 2).toFixed(1)), tekanan_udara: parseFloat((1011 + Math.random() * 5).toFixed(1)) };
          } else if (rand < 0.75) {
            tempInput = { suhu: parseFloat((24 + Math.random() * 5).toFixed(1)), kelembapan: parseFloat((70 + Math.random() * 15).toFixed(1)), kecepatan_angin: parseFloat((8 + Math.random() * 10).toFixed(1)), curah_hujan: parseFloat((2 + Math.random() * 10).toFixed(1)), tekanan_udara: parseFloat((1005 + Math.random() * 6).toFixed(1)) };
          } else {
            tempInput = { suhu: parseFloat((20 + Math.random() * 5).toFixed(1)), kelembapan: parseFloat((85 + Math.random() * 15).toFixed(1)), kecepatan_angin: parseFloat((15 + Math.random() * 18).toFixed(1)), curah_hujan: parseFloat((15 + Math.random() * 35).toFixed(1)), tekanan_udara: parseFloat((995 + Math.random() * 9).toFixed(1)) };
          }

          const classification = await predictNaiveBayes(pool, tempInput);
          const timeObserved = `NOW() - interval '${offset} hours'`;

          // Insert data_cuaca
          await pool.query(
            `INSERT INTO data_cuaca (id, lokasi_id, suhu, kelembapan, kecepatan_angin, curah_hujan, tekanan_udara, aktivitas_petir, waktu_pengamatan, created_by, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ${timeObserved}, $9, ${timeObserved})`,
            [dataCuacaId, loc.id, tempInput.suhu, tempInput.kelembapan, tempInput.kecepatan_angin, tempInput.curah_hujan, tempInput.tekanan_udara, null, adminId]
          );

          // Insert hasil_prediksi
          await pool.query(
            `INSERT INTO hasil_prediksi (id, data_cuaca_id, lokasi_id, probabilitas, tingkat_risiko, warna_marker, rekomendasi, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, ${timeObserved})`,
            [hasilPrediksiId, dataCuacaId, loc.id, classification.confidence, classification.riskLevel, classification.warna_marker, classification.recommendation]
          );
          
          // 7. Seed Notifikasi jika risiko Sedang atau Tinggi
          if (classification.riskLevel !== 'Rendah' && offset === 0) {
            await pool.query(
              `INSERT INTO notifikasi (id, user_id, hasil_prediksi_id, judul, pesan, status_baca, created_at)
               VALUES ($1, $2, $3, $4, $5, false, NOW())`,
              [crypto.randomUUID(), adminId, hasilPrediksiId, `Peringatan Risiko ${classification.riskLevel}!`, `Terdeteksi potensi sambaran petir ${classification.confidence}% di stasiun ${loc.nama_pos}.`,]
            );
          }
        }
      }
      console.log("Berhasil seeding data cuaca dummy, hasil prediksi, dan notifikasi awal.");
    } else {
      console.log("Tabel data_cuaca sudah terisi. Seeding dilewati.");
    }

    console.log("Semua proses seeding database selesai dengan sukses.");
  } catch (err) {
    console.error("Gagal menjalankan database seeder:", err.message);
  }
}

module.exports = { seedDatabase };
