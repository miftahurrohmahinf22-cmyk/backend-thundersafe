const getRecommendation = (riskLevel) => {
  switch (riskLevel) {
    case 'Rendah':
      return 'Kondisi cuaca aman untuk aktivitas luar ruangan. Tetap pantau informasi cuaca secara berkala melalui platform ThunderSafe.';
    case 'Sedang':
      return 'Kelembaban tinggi dan potensi aktivitas petir terdeteksi. Kurangi aktivitas di area terbuka, jauhi pohon tinggi, dan pantau radar cuaca.';
    case 'Tinggi':
      return 'Bahaya ekstrem! Terdeteksi potensi sambaran petir frekuensi tinggi. Segera cari perlindungan di dalam bangunan beton kokoh atau kendaraan tertutup.';
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
 * Menghitung Mean (Rata-rata) dari sebuah array angka
 */
function calculateMean(arr) {
  if (!arr || arr.length === 0) return 0;
  const sum = arr.reduce((acc, val) => acc + val, 0);
  return sum / arr.length;
}

/**
 * Menghitung Variansi (Variance) dari sebuah array angka dengan fallback aman
 */
function calculateVariance(arr, mean) {
  if (!arr || arr.length <= 1) return 1e-9;
  const sqDiffSum = arr.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0);
  const v = sqDiffSum / (arr.length - 1);
  return v <= 1e-9 ? 1e-9 : v;
}

/**
 * Menghitung Log Gaussian Probability Density secara matematis stabil tanpa underflow
 */
function calculateLogGaussianPDF(x, mean, variance) {
  if (x === null || x === undefined || isNaN(x)) return 0; // Missing attribute dropout
  const safeVariance = variance <= 1e-9 ? 1e-9 : variance;
  const stdDev = Math.sqrt(safeVariance);
  const logCoef = -Math.log(Math.sqrt(2 * Math.PI) * stdDev);
  const exponent = -Math.pow(x - mean, 2) / (2 * safeVariance);
  return logCoef + exponent;
}

/**
 * Preprocessing in-memory data observasi BMKG khusus untuk 4 fitur inferensi Naive Bayes:
 * 1. Suhu (TAVG)
 * 2. Kelembapan (RH_AVG)
 * 3. Curah Hujan (RR)
 * 4. Kecepatan Angin (FF_AVG)
 */
function preprocessBMKGForInference(observation, stationName = '') {
  const suhuRaw = observation.suhu !== null && observation.suhu !== undefined ? parseFloat(observation.suhu) : null;
  const rhRaw = observation.kelembapan !== null && observation.kelembapan !== undefined ? parseFloat(observation.kelembapan) : null;
  const windRaw = observation.kecepatan_angin !== null && observation.kecepatan_angin !== undefined ? parseFloat(observation.kecepatan_angin) : null;
  const rainRaw = observation.curah_hujan !== null && observation.curah_hujan !== undefined ? parseFloat(observation.curah_hujan) : null;

  // 1. Kecepatan Angin: Konversi km/jam ke m/s jika nilainya > 15 (satuan km/h ke m/s: m/s = km/h / 3.6)
  let windPreprocessed = windRaw;
  if (windRaw !== null && !isNaN(windRaw)) {
    windPreprocessed = windRaw > 15 ? windRaw / 3.6 : windRaw;
  }

  // 2. Curah Hujan: Deteksi kode missing value 8888 dan 9999
  const isRainMissing = (rainRaw === 8888 || rainRaw === 9999 || rainRaw === null || isNaN(rainRaw));
  const rainPreprocessed = isRainMissing ? null : rainRaw;
  const rainStatus = isRainMissing 
    ? (rainRaw === 8888 ? 'MISSING_8888' : (rainRaw === 9999 ? 'MISSING_9999' : 'MISSING_NULL'))
    : 'VALID';

  return {
    raw: {
      suhu: suhuRaw,
      kelembapan: rhRaw,
      kecepatan_angin: windRaw,
      curah_hujan: rainRaw
    },
    preprocessed: {
      suhu: suhuRaw,
      kelembapan: rhRaw,
      kecepatan_angin: windPreprocessed,
      curah_hujan: rainPreprocessed,
      rainStatus
    }
  };
}

/**
 * Melatih model Naive Bayes menggunakan 4 FITUR UTAMA dari dataset training (92 data):
 * 1. suhu (TAVG)
 * 2. kelembapan (RH_AVG)
 * 3. curah_hujan (RR)
 * 4. kecepatan_angin (FF_AVG)
 */
function trainNaiveBayesModel(trainingData) {
  const groups = { Rendah: [], Sedang: [], Tinggi: [] };
  for (let row of trainingData) {
    if (groups[row.kelas_risiko]) {
      groups[row.kelas_risiko].push({
        suhu: parseFloat(row.suhu),
        kelembapan: parseFloat(row.kelembapan),
        curah_hujan: parseFloat(row.curah_hujan),
        kecepatan_angin: parseFloat(row.kecepatan_angin)
      });
    }
  }
  const totalInstances = trainingData.length || 1;
  const classes = ['Rendah', 'Sedang', 'Tinggi'];
  const stats = {};

  for (let c of classes) {
    const classData = groups[c];
    const count = classData.length;
    const prior = count / totalInstances;

    const suhus = classData.map(d => d.suhu);
    const kelembapans = classData.map(d => d.kelembapan);
    const curahHujans = classData.map(d => d.curah_hujan);
    const kecepatanAngins = classData.map(d => d.kecepatan_angin);

    const mSuhu = calculateMean(suhus);
    const mKelem = calculateMean(kelembapans);
    const mHujan = calculateMean(curahHujans);
    const mAngin = calculateMean(kecepatanAngins);

    stats[c] = {
      prior,
      suhu: { mean: mSuhu, variance: calculateVariance(suhus, mSuhu) },
      kelembapan: { mean: mKelem, variance: calculateVariance(kelembapans, mKelem) },
      curah_hujan: { mean: mHujan, variance: calculateVariance(curahHujans, mHujan) },
      kecepatan_angin: { mean: mAngin, variance: calculateVariance(kecepatanAngins, mAngin) }
    };
  }
  return stats;
}

/**
 * Melakukan kalkulasi prediksi Naive Bayes menggunakan 4 FITUR METEOROLOGI BMKG
 */
function predictWithModel(stats, input, stationName = '', options = {}) {
  const { applyPreprocessing = true } = options;
  
  let prepData;
  if (applyPreprocessing) {
    prepData = preprocessBMKGForInference(input, stationName).preprocessed;
  } else {
    prepData = {
      suhu: input.suhu !== null && input.suhu !== undefined ? parseFloat(input.suhu) : null,
      kelembapan: input.kelembapan !== null && input.kelembapan !== undefined ? parseFloat(input.kelembapan) : null,
      curah_hujan: (input.curah_hujan === 8888 || input.curah_hujan === 9999) ? null : (input.curah_hujan !== null && input.curah_hujan !== undefined ? parseFloat(input.curah_hujan) : null),
      kecepatan_angin: input.kecepatan_angin !== null && input.kecepatan_angin !== undefined ? parseFloat(input.kecepatan_angin) : null
    };
  }

  const classes = ['Rendah', 'Sedang', 'Tinggi'];
  const logScores = {};

  for (let c of classes) {
    const classStats = stats[c];
    let logScore = Math.log(classStats.prior || (1 / 3));

    // KULMINASI 4 FITUR NAIVE BAYES
    logScore += calculateLogGaussianPDF(prepData.suhu, classStats.suhu.mean, classStats.suhu.variance);
    logScore += calculateLogGaussianPDF(prepData.kelembapan, classStats.kelembapan.mean, classStats.kelembapan.variance);
    logScore += calculateLogGaussianPDF(prepData.curah_hujan, classStats.curah_hujan.mean, classStats.curah_hujan.variance);
    logScore += calculateLogGaussianPDF(prepData.kecepatan_angin, classStats.kecepatan_angin.mean, classStats.kecepatan_angin.variance);

    logScores[c] = logScore;
  }

  // Normalisasi Log-Sum-Exp untuk stabilitas numerik tinggi
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
  let bestProb = 0;
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
 * Melakukan klasifikasi Naive Bayes berdasarkan dataset di database untuk 1 request manual
 */
async function predictNaiveBayes(pool, input, preloadedTrainingData = null, stationName = '') {
  let trainingData = preloadedTrainingData;
  if (!trainingData) {
    const res = await pool.query("SELECT suhu, kelembapan, curah_hujan, kecepatan_angin, kelas_risiko FROM dataset_training");
    trainingData = res.rows;
  }

  const stats = trainNaiveBayesModel(trainingData);
  return predictWithModel(stats, input, stationName);
}

/**
 * Fungsi Audit / Debug Mode Read-Only untuk memeriksa log kalkulasi prediksi 4 fitur
 */
function debugNaiveBayesPrediction(observation, stationName = '', stats) {
  const prepResult = preprocessBMKGForInference(observation, stationName);
  const prediction = predictWithModel(stats, observation, stationName);

  return {
    rawBMKG: prepResult.raw,
    preprocessedBMKG: prepResult.preprocessed,
    logScores: prediction.logScores,
    posteriors: prediction.posteriors,
    riskLevel: prediction.riskLevel,
    confidence: prediction.confidence
  };
}

module.exports = {
  predictNaiveBayes,
  trainNaiveBayesModel,
  predictWithModel,
  preprocessBMKGForInference,
  debugNaiveBayesPrediction
};
