const { pool } = require('../config/db');
const EventEmitter = require('events');
const notifEmitter = new EventEmitter();

// Helper untuk broadcast event notifikasi real-time
const broadcastNotifEvent = (notifData) => {
  notifEmitter.emit('notif', notifData);
};

// @desc    SSE Endpoint stream notifikasi real-time
// @route   GET /api/notifications/stream
// @access  Private
const streamNotifications = (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const userId = req.user.id;

  // Kirim sinyal koneksi berhasil
  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Koneksi real-time aktif' })}\n\n`);

  const onNotif = (notif) => {
    if (!notif.user_id || notif.user_id === 'all' || notif.user_id === userId) {
      res.write(`data: ${JSON.stringify(notif)}\n\n`);
    }
  };

  notifEmitter.on('notif', onNotif);

  req.on('close', () => {
    notifEmitter.removeListener('notif', onNotif);
    res.end();
  });
};

// @desc    Ambil daftar notifikasi untuk pengguna yang sedang login
// @route   GET /api/notifications
// @access  Private
const getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const notifRes = await pool.query(
      `SELECT n.id, n.hasil_prediksi_id, n.judul, n.pesan, n.status_baca, n.created_at,
              hp.tingkat_risiko, hp.warna_marker
       FROM notifikasi n
       LEFT JOIN hasil_prediksi hp ON n.hasil_prediksi_id = hp.id
       WHERE n.user_id = $1
       ORDER BY n.created_at DESC
       LIMIT 30`,
      [userId]
    );

    res.status(200).json({
      success: true,
      data: notifRes.rows
    });
  } catch (error) {
    console.error('Error di notifikasiController (getNotifications):', error.message);
    res.status(500).json({
      success: false,
      message: 'Gagal mengambil data notifikasi.'
    });
  }
};

// @desc    Tandai notifikasi sebagai terbaca
// @route   PUT /api/notifications/read/:id
// @access  Private
const markAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const notifCheck = await pool.query(
      'SELECT id FROM notifikasi WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (notifCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Notifikasi tidak ditemukan atau akses ditolak.'
      });
    }

    await pool.query(
      'UPDATE notifikasi SET status_baca = true WHERE id = $1',
      [id]
    );

    res.status(200).json({
      success: true,
      message: 'Notifikasi ditandai sebagai terbaca.'
    });
  } catch (error) {
    console.error('Error di notifikasiController (markAsRead):', error.message);
    res.status(500).json({
      success: false,
      message: 'Gagal merubah status notifikasi.'
    });
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  streamNotifications,
  broadcastNotifEvent
};
