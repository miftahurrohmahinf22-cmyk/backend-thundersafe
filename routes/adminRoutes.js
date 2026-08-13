const express = require('express');
const router = express.Router();
const { protect, authorizeRole } = require('../middleware/authMiddleware');
const {
  getSemuaUser, deleteUser,
  getDataset, addDataset, deleteDataset,
  tambahEdukasi, hapusEdukasi,
  tambahLokasi, hapusLokasi,
  getStatistik,
  getSemuaPrediksi, hapusPrediksi, clearAllPrediksi,
  getSemuaNotifikasi, buatNotifikasi, hapusNotifikasi,
  getSystemSettings, updateSystemSettings,
  getSemuaLaporan, hapusLaporan,
  importCSVDataBMKG
} = require('../controllers/adminController');

// Proteksi seluruh rute admin
router.use(protect);
router.use(authorizeRole('admin'));

// --- Statistik ---
router.get('/statistik', getStatistik);
router.post('/import-csv', importCSVDataBMKG);

// --- Kelola User ---
router.get('/users', getSemuaUser);
router.delete('/users/:id', deleteUser);

// --- Kelola Dataset Training ---
router.get('/dataset', getDataset);
router.post('/dataset', addDataset);
router.delete('/dataset/:id', deleteDataset);

// --- Kelola Edukasi ---
router.post('/edukasi', tambahEdukasi);
router.delete('/edukasi/:id', hapusEdukasi);

// --- Kelola Lokasi Peta ---
router.post('/lokasi', tambahLokasi);
router.delete('/lokasi/:id', hapusLokasi);

// --- Kelola Prediksi & Riwayat ---
router.get('/predictions', getSemuaPrediksi);
router.delete('/predictions/clear-all', clearAllPrediksi);
router.delete('/predictions/:id', hapusPrediksi);

// --- Kelola Laporan ---
router.get('/laporan', getSemuaLaporan);
router.delete('/laporan/:id', hapusLaporan);

// --- Kelola Notifikasi ---
router.get('/notifications', getSemuaNotifikasi);
router.post('/notifications', buatNotifikasi);
router.delete('/notifications/:id', hapusNotifikasi);

// --- System Settings ---
router.get('/settings', getSystemSettings);
router.put('/settings', updateSystemSettings);

module.exports = router;

