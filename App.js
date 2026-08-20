const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const cors = require("cors");
const { connectDB } = require("./config/db");

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err.message, err.stack);
});

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
});

const app = express();

// Hubungkan ke database PostgreSQL (Supabase)
connectDB();

// Middleware CORS khusus Local Development
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:5000",
  process.env.CLIENT_URL
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  optionsSuccessStatus: 200
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Import Rute-rute API
const cuacaRoutes = require("./routes/cuacaRoutes");
const eduksiRoutes = require("./routes/eduksiRoutes");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const prediksiRoutes = require("./routes/prediksiRoutes");
const hasilPrediksiRoutes = require("./routes/hasilPrediksiRoutes");
const lokasiRoutes = require("./routes/lokasiRoutes");
const notifikasiRoutes = require("./routes/notifikasiRoutes");
const laporanRoutes = require("./routes/laporanRoutes");
const adminRoutes = require("./routes/adminRoutes");

// Endpoint Publik Utama
app.get("/", (_req, res) => {
  res.status(200).send("OK - ThunderSafe Backend Active");
});

app.get("/api/health", (_req, res) => {
  res.status(200).send("OK - ThunderSafe Backend Active");
});

// Daftarkan Rute API
app.use("/api/cuaca", cuacaRoutes);
app.use("/api/edukasi", eduksiRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/prediction", prediksiRoutes);
app.use("/api/history", hasilPrediksiRoutes);
app.use("/api/lokasi", lokasiRoutes);
app.use("/api/notifications", notifikasiRoutes);
app.use("/api/laporan", laporanRoutes);
app.use("/api/admin", adminRoutes);

// Handling 404 Fallback Route
app.use((req, res) => {
  res.status(404).json({ status: "error", message: "Route tidak ditemukan" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server ThunderSafe Backend aktif di http://localhost:${PORT}`);
});

module.exports = app;
