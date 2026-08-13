const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const cors = require("cors");
const { connectDB } = require("./config/db");

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
  res.json({
    status: "ok",
    message: "ThunderSafe Local Backend Siap",
    endpoints: [
      "/api/health",
      "/api/cuaca/terbaru",
      "/api/edukasi",
      "/api/auth/register",
      "/api/auth/login",
      "/api/users/profile",
      "/api/prediction",
      "/api/history",
      "/api/lokasi",
      "/api/notifications",
      "/api/laporan"
    ],
  });
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", message: "ThunderSafe backend aktif" });
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
app.listen(PORT, () => {
  console.log(`Server ThunderSafe Backend aktif di http://localhost:${PORT}`);
});

module.exports = app;
