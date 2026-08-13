const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'thundersafe_jwt_secret_key_2026';

const protect = (req, res, next) => {
  let token;

  // Cek token di Authorization header
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // Ambil token dari format "Bearer TOKEN"
      token = req.headers.authorization.split(' ')[1];

      // Verifikasi token
      const decoded = jwt.verify(token, JWT_SECRET);

      // Simpan data user hasil decode ke request object
      req.user = {
        id: decoded.id,
        email: decoded.email,
        nama: decoded.nama,
        role: decoded.role
      };

      return next();
    } catch (error) {
      console.error('Verifikasi token JWT gagal:', error.message);
      return res.status(401).json({
        success: false,
        message: 'Tidak terotorisasi, token tidak valid'
      });
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Tidak terotorisasi, tidak ada token'
    });
  }
};

const authorizeRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak. Anda tidak memiliki izin (role tidak sesuai).'
      });
    }
    next();
  };
};

module.exports = {
  protect,
  authorizeRole,
  JWT_SECRET
};
