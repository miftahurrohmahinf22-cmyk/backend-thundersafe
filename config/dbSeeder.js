const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const rawObservations = require('./bmkgObservations');
const {
  preprocessBMKGData,
  runKMeansLabeling,
  stratifiedSplit,
  trainNaiveBayesModel,
  predictWithModel
} = require('../services/naiveBayes');

async function seedDatabase(pool) {
  try {
    console.log("=== THUNDERSAFE RESEARCH DATABASE SEEDER ===");

    // 1. Preprocessing Data Observasi Awal (1.092 Data Awal -> 1.064 Main Dataset)
    const validDataset = [];
    let invalidCount = 0;

    for (let raw of rawObservations) {
      const prep = preprocessBMKGData(raw);
      if (prep.isValid) {
        validDataset.push(prep.data);
      } else {
        invalidCount++;
      }
    }

    console.log(`Initial BMKG Observations: ${rawObservations.length}`);
    console.log(`Invalid Rows (Curah Hujan 8888 dropped): ${invalidCount}`);
    console.log(`Main Research Dataset: ${validDataset.length}`);

    // 2. K-Means Clustering (K=3, 5 Fitur: suhu, kelembapan, tekanan_udara, curah_hujan, kecepatan_angin)
    const { labeledDataset } = runKMeansLabeling(validDataset, 3);

    // 3. Pembagian Dataset Stratified Split (80% Training = 851 data, 20% Testing = 213 data)
    const { trainData, testData } = stratifiedSplit(labeledDataset, 0.8);
    console.log(`Stratified Split -> Training: ${trainData.length}, Testing: ${testData.length}`);

    // 4. Seed Lokasi
    const lokasiCountRes = await pool.query("SELECT COUNT(*) FROM lokasi");
    const lokasiCount = parseInt(lokasiCountRes.rows[0].count, 10);
    
    let locationsMap = {};
    if (lokasiCount === 0) {
      const locationsData = [
        { nama_pos: 'Stasiun Geofisika Sleman', kawasan: 'Sleman', desa: 'Sleman', kecamatan: 'Sleman', kabupaten: 'Sleman', lat: -7.82, lon: 110.3 },
        { nama_pos: 'Stasiun Klimatologi DI Yogyakarta', kawasan: 'Yogyakarta', desa: 'Sleman', kecamatan: 'Sleman', kabupaten: 'Sleman', lat: -7.731, lon: 110.354 },
        { nama_pos: 'Pos Sleman Kota', kawasan: 'Pusat Kota', desa: 'Triadi', kecamatan: 'Sleman', kabupaten: 'Sleman', lat: -7.7156, lon: 110.3556 },
        { nama_pos: 'Pos Malioboro', kawasan: 'Kawasan Wisata', desa: 'Sosromenduran', kecamatan: 'Gedongtengen', kabupaten: 'Yogyakarta', lat: -7.7926, lon: 110.3658 }
      ];

      for (let loc of locationsData) {
        const id = crypto.randomUUID();
        await pool.query(
          `INSERT INTO lokasi (id, nama_pos, kawasan, desa, kecamatan, kabupaten, latitude, longtitude, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
          [id, loc.nama_pos, loc.kawasan, loc.desa, loc.kecamatan, loc.kabupaten, loc.lat, loc.lon]
        );
        locationsMap[loc.nama_pos] = id;
      }
      console.log(`Berhasil seeding ${locationsData.length} lokasi.`);
    } else {
      const res = await pool.query("SELECT id, nama_pos FROM lokasi");
      res.rows.forEach(r => { locationsMap[r.nama_pos] = r.id; });
    }

    const defaultLocId = Object.values(locationsMap)[0] || crypto.randomUUID();

    // 5. Seed Dataset Training (851 Data Training Hasil K-Means & Split 80%)
    await pool.query("DELETE FROM dataset_training");
    console.log("Memulai seeding 851 data training ke tabel dataset_training...");

    const batchSize = 100;
    for (let i = 0; i < trainData.length; i += batchSize) {
      const chunk = trainData.slice(i, i + batchSize);
      const valueClauses = [];
      const values = [];
      let pIdx = 1;

      for (let d of chunk) {
        valueClauses.push(`($${pIdx}, $${pIdx+1}, $${pIdx+2}, $${pIdx+3}, $${pIdx+4}, $${pIdx+5}, $${pIdx+6}, $${pIdx+7})`);
        const petir = d.kelas_risiko === 'Tinggi' ? Math.floor(Math.random() * 15 + 10) : (d.kelas_risiko === 'Sedang' ? Math.floor(Math.random() * 8 + 2) : 0);
        values.push(crypto.randomUUID(), d.suhu, d.kelembapan, d.kecepatan_angin, d.curah_hujan, d.tekanan_udara, petir, d.kelas_risiko);
        pIdx += 8;
      }

      await pool.query(
        `INSERT INTO dataset_training (id, suhu, kelembapan, kecepatan_angin, curah_hujan, tekanan_udara, aktivitas_petir, kelas_risiko)
         VALUES ${valueClauses.join(', ')}`,
        values
      );
    }
    console.log(`Berhasil seeding ${trainData.length} data latih Naive Bayes (851 Training Records).`);

    // 6. Seed Default Admin User
    const adminExistRes = await pool.query('SELECT id FROM "User" WHERE role = $1 LIMIT 1', ['admin']);
    let adminId = adminExistRes.rows.length > 0 ? adminExistRes.rows[0].id : null;
    
    if (!adminId) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('admin123', salt);
      adminId = crypto.randomUUID();
      
      await pool.query(
        `INSERT INTO "User" (id, nama, email, password, "photo profile", role, create_at, update_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
        [adminId, 'Administrator', 'admin@thundersafe.com', hashedPassword, '', 'admin']
      );
      console.log("Berhasil membuat default Admin: admin@thundersafe.com (password: admin123)");
    }

    // 7. Seed Main Research Dataset (1.064 Rows) into data_cuaca & hasil_prediksi
    await pool.query("DELETE FROM notifikasi WHERE hasil_prediksi_id IS NOT NULL");
    await pool.query("DELETE FROM laporan WHERE hasil_prediksi_id IS NOT NULL");
    await pool.query("DELETE FROM hasil_prediksi");
    await pool.query("DELETE FROM data_cuaca");

    console.log("Memperbarui data_cuaca dan hasil_prediksi dengan 1.064 data observasi utama...");
    const modelStats = trainNaiveBayesModel(trainData);

    for (let i = 0; i < labeledDataset.length; i += batchSize) {
      const chunk = labeledDataset.slice(i, i + batchSize);
      const cuacaClauses = [];
      const cuacaValues = [];
      let cIdx = 1;

      const predClauses = [];
      const predValues = [];
      let rIdx = 1;

      for (let item of chunk) {
        const cuacaId = crypto.randomUUID();
        const predId = crypto.randomUUID();
        const locId = locationsMap[item.station_name] || defaultLocId;
        const predRes = predictWithModel(modelStats, item);

        cuacaClauses.push(`($${cIdx}, $${cIdx+1}, $${cIdx+2}, $${cIdx+3}, $${cIdx+4}, $${cIdx+5}, $${cIdx+6}, $${cIdx+7}, $${cIdx+8}, $${cIdx+9}, NOW())`);
        cuacaValues.push(cuacaId, locId, item.suhu, item.kelembapan, item.kecepatan_angin, item.curah_hujan, item.tekanan_udara, null, item.data_timestamp, adminId);
        cIdx += 10;

        predClauses.push(`($${rIdx}, $${rIdx+1}, $${rIdx+2}, $${rIdx+3}, $${rIdx+4}, $${rIdx+5}, $${rIdx+6}, $${rIdx+7})`);
        predValues.push(predId, cuacaId, locId, predRes.confidence, item.kelas_risiko, predRes.warna_marker, predRes.recommendation, item.data_timestamp);
        rIdx += 8;
      }

      await pool.query(
        `INSERT INTO data_cuaca (id, lokasi_id, suhu, kelembapan, kecepatan_angin, curah_hujan, tekanan_udara, aktivitas_petir, waktu_pengamatan, created_by, created_at)
         VALUES ${cuacaClauses.join(', ')}`,
        cuacaValues
      );

      await pool.query(
        `INSERT INTO hasil_prediksi (id, data_cuaca_id, lokasi_id, probabilitas, tingkat_risiko, warna_marker, rekomendasi, created_at)
         VALUES ${predClauses.join(', ')}`,
        predValues
      );
    }
    console.log(`Berhasil seeding ${labeledDataset.length} data observasi utama dan hasil prediksi.`);


    // 8. Seed Edukasi (Artikel Mitigasi)
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
    console.log(`Berhasil seeding ${articles.length} artikel edukasi.`);
    console.log("=== THUNDERSAFE SEEDING COMPLETE ===");

  } catch (err) {
    console.error("Gagal menjalankan database seeder:", err.message);
  }
}

module.exports = { seedDatabase };

if (require.main === module) {
  const { pool } = require('./db');
  seedDatabase(pool)
    .then(() => {
      console.log('Seeder completed successfully.');
      process.exit(0);
    })
    .catch(err => {
      console.error('Seeder failed:', err);
      process.exit(1);
    });
}



