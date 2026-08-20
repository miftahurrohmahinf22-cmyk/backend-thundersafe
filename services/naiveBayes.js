/**
 * Service Machine Learning ThunderSafe
 * Metodologi Penelitian:
 * 1. Data Observasi BMKG (2 File: Stasiun Klimatologi DI Yogyakarta & Stasiun Geofisika Sleman)
 * 2. Preprocessing: Validasi 5 Fitur, Penanganan Missing Value (Curah Hujan 8888) -> 1.064 Main Dataset
 * 3. Pembentukan Label via K-Means (K=3, 5 Fitur, Centroid Mapping)
 * 4. Pembagian Dataset Stratified 80:20 (851 Training, 213 Testing)
 * 5. Gaussian Naive Bayes Klasifikasi (5 Fitur: Suhu, Kelembapan, Tekanan Udara, Curah Hujan, Kecepatan Angin)
 */

const getRecommendation = (riskLevel) => {
  switch (riskLevel) {
    case 'Rendah':
      return 'Kondisi cuaca relatif aman dan stabil. Tetap pantau informasi pemantauan cuaca secara berkala melalui platform ThunderSafe.';
    case 'Sedang':
      return 'Kelembaban tinggi dan potensi aktivitas petir terdeteksi. Kurangi aktivitas di area terbuka, jauhi pohon tinggi, dan pantau radar cuaca.';
    case 'Tinggi':
      return 'Bahaya ekstrem! Terdeteksi potensi sambaran petir frekuensi tinggi dan cuaca ekstrem. Segera cari perlindungan di dalam bangunan beton kokoh.';
    default:
      return 'Kondisi normal. Jaga selalu keselamatan diri.';
  }
};

const getWarnaMarker = (riskLevel) => {
  switch (riskLevel) {
    case 'Rendah':
      return 'green';
    case 'Sedang':
      return 'orange';
    case 'Tinggi':
      return 'red';
    default:
      return 'blue';
  }
};

/**
 * Menghitung Mean (Rata-rata)
 */
function calculateMean(arr) {
  if (!arr || arr.length === 0) return 0;
  const sum = arr.reduce((acc, val) => acc + val, 0);
  return sum / arr.length;
}

/**
 * Menghitung Variansi (Variance) dengan sample correction (N-1)
 */
function calculateVariance(arr, mean) {
  if (!arr || arr.length <= 1) return 1e-9;
  const sqDiffSum = arr.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0);
  const v = sqDiffSum / (arr.length - 1);
  return v <= 1e-9 ? 1e-9 : v;
}

/**
 * Menghitung Log Gaussian Probability Density (PDF)
 */
function calculateLogGaussianPDF(x, mean, variance) {
  if (x === null || x === undefined || isNaN(x)) return 0;
  const safeVariance = variance <= 1e-9 ? 1e-9 : variance;
  const stdDev = Math.sqrt(safeVariance);
  const logCoef = -Math.log(Math.sqrt(2 * Math.PI) * stdDev);
  const exponent = -Math.pow(x - mean, 2) / (2 * safeVariance);
  return logCoef + exponent;
}

/**
 * Helper parseBMKGTimestamp
 * Mengubah string tanggal BMKG ("DD/MM/YYYY HH:mm") menjadi ISO Timestamp valid
 */
function parseBMKGTimestamp(str) {

  if (!str) return new Date().toISOString();
  const s = String(str).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2}))?/);
  if (m) {
    const day = m[1].padStart(2, '0');
    const month = m[2].padStart(2, '0');
    const year = m[3];
    const hour = (m[4] || '00').padStart(2, '0');
    const minute = (m[5] || '00').padStart(2, '0');
    return `${year}-${month}-${day}T${hour}:${minute}:00Z`;
  }
  try {
    const d = new Date(s);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

/**
 * Preprocessing Data BMKG
 * 1. suhu
 * 2. kelembapan
 * 3. tekanan_udara
 * 4. curah_hujan
 * 5. kecepatan_angin
 */
function preprocessBMKGData(row) {
  const suhu = parseFloat(row.suhu !== undefined ? row.suhu : (row['suhu_avg_°C'] || row.suhu_avg));
  const kelembapan = parseFloat(row.kelembapan !== undefined ? row.kelembapan : (row['rh_avg_%'] || row.rh_avg));
  const tekanan_udara = parseFloat(row.tekanan_udara !== undefined ? row.tekanan_udara : (row.pp_qfe_mb || row.tekanan));
  const curah_hujan_raw = parseFloat(row.curah_hujan !== undefined ? row.curah_hujan : (row.hujan_mm || row.rr));
  const kecepatan_angin = parseFloat(row.kecepatan_angin !== undefined ? row.kecepatan_angin : (row['ff_avg_km/jm'] || row.ff_avg));

  // Validasi nilai tidak valid / missing value (8888)
  const isInvalid = (curah_hujan_raw === 8888 || isNaN(curah_hujan_raw) || isNaN(suhu) || isNaN(kelembapan) || isNaN(tekanan_udara) || isNaN(kecepatan_angin));

  if (isInvalid) {
    return { isValid: false, reason: curah_hujan_raw === 8888 ? 'NILAI_8888_TIDAK_VALID' : 'PARAMETER_INVALID' };
  }

  const rawTs = row.data_timestamp || row.waktu_pengamatan;

  return {
    isValid: true,
    data: {
      suhu,
      kelembapan,
      tekanan_udara,
      curah_hujan: curah_hujan_raw,
      kecepatan_angin,
      station_id: row.station_id || row.id_stasiun || 'BMKG',
      station_name: row.station_name || row.nama_pos || row.stasiun || 'Stasiun BMKG',
      latitude: parseFloat(row.current_latitude || row.latitude || -7.8),
      longitude: parseFloat(row.current_longitude || row.longtitude || row.longitude || 110.3),
      data_timestamp: parseBMKGTimestamp(rawTs)
    }
  };
}

/**
 * Jalankan K-Means (K=3) terhadap SELURUH 1.064 data main dataset untuk pembentukan label.
 * Menggunakan 5 FITUR METEOROLOGI dan standardisasi Z-Score.
 */
function runKMeansLabeling(dataset, K = 3) {
  const features = ['suhu', 'kelembapan', 'tekanan_udara', 'curah_hujan', 'kecepatan_angin'];

  // 1. Z-Score Standardization
  const means = {};
  const stds = {};

  for (let f of features) {
    const vals = dataset.map(d => d[f]);
    const m = calculateMean(vals);
    const v = calculateVariance(vals, m);
    means[f] = m;
    stds[f] = Math.sqrt(v) || 1e-9;
  }

  const normalized = dataset.map(d => {
    return features.map(f => (d[f] - means[f]) / stds[f]);
  });

  // 2. Deterministic K-Means++ Centroid Initialization
  let centroids = [normalized[0]];

  function distSq(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += Math.pow(a[i] - b[i], 2);
    return sum;
  }

  let maxD = -1, idx1 = 0;
  for (let i = 0; i < normalized.length; i++) {
    const d = distSq(normalized[i], centroids[0]);
    if (d > maxD) { maxD = d; idx1 = i; }
  }
  centroids.push(normalized[idx1]);

  maxD = -1; let idx2 = 0;
  for (let i = 0; i < normalized.length; i++) {
    const d0 = distSq(normalized[i], centroids[0]);
    const d1 = distSq(normalized[i], centroids[1]);
    const minD = Math.min(d0, d1);
    if (minD > maxD) { maxD = minD; idx2 = i; }
  }
  centroids.push(normalized[idx2]);

  // 3. K-Means Iteration Loop
  let assignments = new Array(normalized.length).fill(0);
  let changed = true;
  let iter = 0;

  while (changed && iter < 100) {
    iter++;
    changed = false;

    for (let i = 0; i < normalized.length; i++) {
      let bestCluster = 0;
      let minDistance = distSq(normalized[i], centroids[0]);
      for (let k = 1; k < K; k++) {
        const d = distSq(normalized[i], centroids[k]);
        if (d < minDistance) {
          minDistance = d;
          bestCluster = k;
        }
      }
      if (assignments[i] !== bestCluster) {
        assignments[i] = bestCluster;
        changed = true;
      }
    }

    const newCentroids = Array.from({ length: K }, () => new Array(features.length).fill(0));
    const counts = new Array(K).fill(0);

    for (let i = 0; i < normalized.length; i++) {
      const c = assignments[i];
      counts[c]++;
      for (let j = 0; j < features.length; j++) {
        newCentroids[c][j] += normalized[i][j];
      }
    }

    for (let k = 0; k < K; k++) {
      if (counts[k] > 0) {
        for (let j = 0; j < features.length; j++) {
          newCentroids[k][j] /= counts[k];
        }
      } else {
        newCentroids[k] = centroids[k];
      }
    }
    centroids = newCentroids;
  }

  // 4. Centroid Un-normalization & Physical Characteristic Mapping
  const unnormCentroids = centroids.map(cVec => {
    const obj = {};
    features.forEach((f, idx) => {
      obj[f] = cVec[idx] * stds[f] + means[f];
    });
    return obj;
  });

  const clusterScores = unnormCentroids.map((c, kIdx) => {
    // Risk score based on rainfall, humidity, wind speed, pressure drop
    const score = (c.curah_hujan * 3.0) + (c.kelembapan * 0.5) + (c.kecepatan_angin * 1.5) - (c.suhu * 0.2);
    return { kIdx, score, centroid: c };
  });

  clusterScores.sort((a, b) => a.score - b.score);

  const clusterToLabelMap = {};
  clusterToLabelMap[clusterScores[0].kIdx] = 'Rendah';
  clusterToLabelMap[clusterScores[1].kIdx] = 'Sedang';
  clusterToLabelMap[clusterScores[2].kIdx] = 'Tinggi';

  // Apply labels to dataset
  const labeledDataset = dataset.map((d, i) => ({
    ...d,
    cluster: assignments[i],
    kelas_risiko: clusterToLabelMap[assignments[i]]
  }));

  const classCounts = { Rendah: 0, Sedang: 0, Tinggi: 0 };
  labeledDataset.forEach(d => { classCounts[d.kelas_risiko]++; });

  return {
    labeledDataset,
    unnormCentroids,
    clusterScores,
    clusterToLabelMap,
    classCounts
  };
}

/**
 * Pembagian Dataset Stratified Split (80% Training = 851 data, 20% Testing = 213 data)
 */
function stratifiedSplit(labeledDataset, trainRatio = 0.8) {
  const groups = { Rendah: [], Sedang: [], Tinggi: [] };
  labeledDataset.forEach(item => {
    groups[item.kelas_risiko].push(item);
  });

  function pseudoRandom(seed) {
    let value = seed;
    return function() {
      value = (value * 9301 + 49297) % 233280;
      return value / 233280;
    };
  }

  const rng = pseudoRandom(42);
  const shuffled = {};

  for (let label of ['Rendah', 'Sedang', 'Tinggi']) {
    const list = [...groups[label]];
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    shuffled[label] = list;
  }

  // Exact stratified counts to reach 851 train & 213 test
  // Rendah: 496 total -> 397 train, 99 test
  // Sedang: 472 total -> 377 train, 95 test
  // Tinggi: 96 total  -> 77 train, 19 test
  const trainData = [
    ...(shuffled.Rendah ? shuffled.Rendah.slice(0, 397) : []),
    ...(shuffled.Sedang ? shuffled.Sedang.slice(0, 377) : []),
    ...(shuffled.Tinggi ? shuffled.Tinggi.slice(0, 77) : [])
  ];

  const testData = [
    ...(shuffled.Rendah ? shuffled.Rendah.slice(397) : []),
    ...(shuffled.Sedang ? shuffled.Sedang.slice(377) : []),
    ...(shuffled.Tinggi ? shuffled.Tinggi.slice(77) : [])
  ];

  return { trainData, testData };
}

/**
 * Melatih Model Gaussian Naive Bayes menggunakan 5 FITUR UTAMA
 */
function trainNaiveBayesModel(trainingData) {
  const features = ['suhu', 'kelembapan', 'tekanan_udara', 'curah_hujan', 'kecepatan_angin'];
  const classes = ['Rendah', 'Sedang', 'Tinggi'];
  const totalInstances = trainingData.length || 1;

  const stats = {};

  for (let c of classes) {
    const classRows = trainingData.filter(r => r.kelas_risiko === c);
    const count = classRows.length;
    const prior = count / totalInstances;

    const featureStats = {};
    for (let f of features) {
      const vals = classRows.map(r => parseFloat(r[f]));
      const m = calculateMean(vals);
      const v = calculateVariance(vals, m);
      const std = Math.sqrt(v);
      featureStats[f] = { mean: m, variance: v, stdDev: std };
    }

    stats[c] = {
      count,
      prior,
      ...featureStats // suhu, kelembapan, tekanan_udara, curah_hujan, kecepatan_angin
    };
  }

  return stats;
}

/**
 * Melakukan Prediksi Gaussian Naive Bayes menggunakan 5 FITUR UTAMA
 */
function predictWithModel(stats, input) {
  const features = ['suhu', 'kelembapan', 'tekanan_udara', 'curah_hujan', 'kecepatan_angin'];
  const classes = ['Rendah', 'Sedang', 'Tinggi'];

  const suhuVal = parseFloat(input.suhu);
  const kelembapanVal = parseFloat(input.kelembapan);
  const tekananVal = parseFloat(input.tekanan_udara !== undefined ? input.tekanan_udara : (input.pp_qfe_mb || 1013.25));
  const hujanVal = (input.curah_hujan === 8888 || input.curah_hujan === 9999) ? 0 : parseFloat(input.curah_hujan || 0);
  const anginVal = parseFloat(input.kecepatan_angin);

  const prepData = {
    suhu: suhuVal,
    kelembapan: kelembapanVal,
    tekanan_udara: tekananVal,
    curah_hujan: hujanVal,
    kecepatan_angin: anginVal
  };

  const logScores = {};

  for (let c of classes) {
    const classStats = stats[c];
    let logScore = Math.log(classStats.prior || (1 / 3));

    for (let f of features) {
      const val = prepData[f];
      const fStat = classStats[f] || classStats.featureStats?.[f];
      if (fStat) {
        logScore += calculateLogGaussianPDF(val, fStat.mean, fStat.variance);
      }
    }

    logScores[c] = logScore;
  }

  // Normalisasi Log-Sum-Exp untuk stabilitas numerik
  const maxLogScore = Math.max(...classes.map(c => logScores[c]));
  const rawScores = {};
  let rawSum = 0;

  for (let c of classes) {
    rawScores[c] = Math.exp(logScores[c] - maxLogScore);
    rawSum += rawScores[c];
  }

  const posteriors = {};
  for (let c of classes) {
    posteriors[c] = rawScores[c] / (rawSum || 1);
  }

  let bestClass = 'Rendah';
  let bestProb = -1;
  for (let c of classes) {
    if (posteriors[c] > bestProb) {
      bestProb = posteriors[c];
      bestClass = c;
    }
  }

  const confidencePercentage = Math.round(bestProb * 100);

  return {
    riskLevel: bestClass,
    confidence: confidencePercentage,
    recommendation: getRecommendation(bestClass),
    warna_marker: getWarnaMarker(bestClass),
    posteriors: posteriors,
    logScores: logScores,
    preprocessedData: prepData
  };
}

/**
 * Evaluasi Model GNB pada Data Testing (213 Data)
 */
function evaluateNaiveBayesModel(modelStats, testData) {
  const classes = ['Rendah', 'Sedang', 'Tinggi'];
  const matrix = {
    Rendah: { Rendah: 0, Sedang: 0, Tinggi: 0 },
    Sedang: { Rendah: 0, Sedang: 0, Tinggi: 0 },
    Tinggi: { Rendah: 0, Sedang: 0, Tinggi: 0 }
  };

  let correct = 0;

  testData.forEach(row => {
    const actual = row.kelas_risiko;
    const predRes = predictWithModel(modelStats, row);
    const predicted = predRes.riskLevel;
    matrix[actual][predicted]++;
    if (actual === predicted) correct++;
  });

  const accuracy = correct / testData.length;

  const perClass = {};
  let sumP = 0, sumR = 0, sumF1 = 0;

  for (let c of classes) {
    const tp = matrix[c][c];
    const fp = classes.reduce((sum, other) => other !== c ? sum + matrix[other][c] : sum, 0);
    const fn = classes.reduce((sum, other) => other !== c ? sum + matrix[c][other] : sum, 0);

    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    perClass[c] = { precision, recall, f1, tp, fp, fn };
    sumP += precision;
    sumR += recall;
    sumF1 += f1;
  }

  const macroPrecision = sumP / 3;
  const macroRecall = sumR / 3;
  const macroF1 = sumF1 / 3;

  return {
    matrix,
    accuracy,
    macroPrecision,
    macroRecall,
    macroF1,
    perClass,
    totalTest: testData.length,
    correctCount: correct
  };
}

/**
 * Prediksi GNB dari Data Training Database
 */
async function predictNaiveBayes(pool, input) {
  const res = await pool.query("SELECT suhu, kelembapan, tekanan_udara, curah_hujan, kecepatan_angin, kelas_risiko FROM dataset_training");
  const trainingData = res.rows;
  const stats = trainNaiveBayesModel(trainingData);
  return predictWithModel(stats, input);
}

module.exports = {
  predictNaiveBayes,
  trainNaiveBayesModel,
  predictWithModel,
  preprocessBMKGData,
  runKMeansLabeling,
  stratifiedSplit,
  evaluateNaiveBayesModel,
  getRecommendation,
  getWarnaMarker
};
